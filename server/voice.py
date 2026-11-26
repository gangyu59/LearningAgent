"""语音：本机 Whisper 识别日语（Apple 芯片用 mlx-whisper，否则 faster-whisper）+ 微软 edge-tts 朗读。
与 OmniTwin 的 voice 模块同一套做法；依赖没装时接口返回明确提示，前端退回浏览器自带识别/朗读。"""
import asyncio
import hashlib
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TTS_DIR = ROOT / "data" / "tts_cache"

os.environ.setdefault("HF_ENDPOINT", os.environ.get("HF_ENDPOINT", "https://hf-mirror.com"))
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

STT_MODEL = os.environ.get("JC_STT_MODEL", "large-v3-turbo")
MLX_REPO = os.environ.get("JC_STT_MLX_REPO", "mlx-community/whisper-large-v3-turbo")
DEFAULT_VOICE = os.environ.get("JC_TTS_VOICE", "ja-JP-NanamiNeural")
PROMPT = "これは日本語学習者との会話です。旅行、食事、買い物、道案内などについて話します。"

VOICES = [
    {"id": "ja-JP-NanamiNeural", "name": "七海 Nanami（女·自然）", "gender": "female"},
    {"id": "ja-JP-ShioriNeural", "name": "栞 Shiori（女·柔和）", "gender": "female"},
    {"id": "ja-JP-MayuNeural", "name": "真由 Mayu（女·明亮）", "gender": "female"},
    {"id": "ja-JP-AoiNeural", "name": "葵 Aoi（女·年轻）", "gender": "female"},
    {"id": "ja-JP-KeitaNeural", "name": "圭太 Keita（男·自然）", "gender": "male"},
    {"id": "ja-JP-DaichiNeural", "name": "大地 Daichi（男·沉稳）", "gender": "male"},
    {"id": "ja-JP-NaokiNeural", "name": "直樹 Naoki（男·清晰）", "gender": "male"},
]

# 翻译页朗读其他语言用
OTHER_VOICES = {"zh": "zh-CN-XiaoxiaoNeural", "en": "en-US-JennyNeural", "fr": "fr-FR-DeniseNeural"}
ALL_VOICE_IDS = {v["id"] for v in VOICES} | set(OTHER_VOICES.values())
TTS_CACHE_MAX = 4000  # 朗读缓存文件数上限，超出时删最旧的

state = {"status": "idle", "error": "", "engine": ""}  # idle | loading | ready | error
_model = None
_engine = ""
# MLX 的 GPU 流绑定线程：加载与识别必须始终在同一线程
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stt")


def stt_available() -> bool:
    for mod in ("mlx_whisper", "faster_whisper"):
        try:
            __import__(mod)
            return True
        except ImportError:
            continue
    return False


def tts_available() -> bool:
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def _load() -> None:
    global _model, _engine
    if _model is not None:
        return
    state.update(status="loading", error="")
    try:
        try:
            import mlx_whisper
            import numpy as np
            mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=MLX_REPO, language="ja")  # 预热/下载
            _model, _engine = mlx_whisper, "mlx"
        except ImportError:
            from faster_whisper import WhisperModel
            _model, _engine = WhisperModel(STT_MODEL, device="cpu", compute_type="int8", cpu_threads=8), "faster"
        state.update(status="ready", engine=_engine)
    except Exception as e:  # noqa: BLE001
        state.update(status="error", error=str(e)[:200])
        raise


def prune_cache() -> None:
    try:
        files = sorted(TTS_DIR.glob("*.mp3"), key=lambda f: f.stat().st_mtime)
        for f in files[:max(0, len(files) - TTS_CACHE_MAX)]:
            f.unlink(missing_ok=True)
    except OSError:
        pass


def preload() -> None:
    if not stt_available():
        return
    f = _pool.submit(_load)
    f.add_done_callback(lambda x: x.exception())


_HALLUCINATIONS = ("ご視聴ありがとう", "チャンネル登録", "ご清聴ありがとう", "字幕", "おやすみなさい", "Thank you", "thanks for watching")


def is_garbage(t: str) -> bool:
    """静音/噪声下 Whisper 会输出重复字或固定的幻觉句，一律视为无效。"""
    t = (t or "").strip()
    if not t:
        return True
    if re.search(r"(.)\1{6,}", t) or re.search(r"(.{2,8})\1{3,}", t):
        return True
    if len(t) > 12 and len(set(t)) / len(t) < 0.25:
        return True
    if t.strip("、。,. ！？!?") == "" or PROMPT[:12] in t:
        return True
    return len(t) < 24 and any(h.lower() in t.lower() for h in _HALLUCINATIONS)


def _transcribe(pcm16: bytes) -> str:
    import numpy as np
    _load()
    audio = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32) / 32768.0
    if len(audio) < 16000 * 0.3:
        return ""
    if _engine == "mlx":
        r = _model.transcribe(audio, path_or_hf_repo=MLX_REPO, language="ja", initial_prompt=PROMPT, temperature=0.0,
                              condition_on_previous_text=False, no_speech_threshold=0.5, compression_ratio_threshold=2.2)
        text = r["text"].strip()
    else:
        segs, _ = _model.transcribe(audio, language="ja", initial_prompt=PROMPT, beam_size=1, vad_filter=True,
                                    vad_parameters={"min_silence_duration_ms": 300}, condition_on_previous_text=False,
                                    no_speech_threshold=0.5, temperature=0.0)
        text = "".join(s.text for s in segs).strip()
    return "" if is_garbage(text) else text


async def transcribe(pcm16: bytes) -> str:
    """16kHz 单声道 PCM16 → 日语文字。"""
    return await asyncio.get_running_loop().run_in_executor(_pool, _transcribe, pcm16)


def clean_for_speech(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"[*_`>#]+", "", text)
    return re.sub(r"\n{2,}", "\n", text).strip()


async def tts(text: str, voice: str = "", rate: str = "+0%") -> bytes:
    import edge_tts
    voice = voice or DEFAULT_VOICE
    TTS_DIR.mkdir(parents=True, exist_ok=True)
    f = TTS_DIR / (hashlib.md5(f"{voice}|{rate}|{text}".encode()).hexdigest() + ".mp3")
    if f.exists():
        return f.read_bytes()
    last = None
    for _ in range(2):
        try:
            buf = bytearray()
            async for ch in edge_tts.Communicate(text, voice, rate=rate).stream():
                if ch["type"] == "audio":
                    buf += ch["data"]
            if buf:
                f.write_bytes(bytes(buf))
                return bytes(buf)
        except Exception as e:  # noqa: BLE001
            last = e
            await asyncio.sleep(0.3)
    raise RuntimeError(f"语音合成失败：{last}")
