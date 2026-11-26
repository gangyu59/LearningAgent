"""日语会话老师的提示词与回复解析。

回复格式（便于边生成边朗读）：第一段只有日语，之后用独占一行的 [ZH] [FIX] [HINT] 分段。"""
import re

LEVELS = {
    "N5": "N5（入门）：只用です・ます体、基础词汇，句子很短，尽量不用汉字难词",
    "N4": "N4（初级）：简单句为主，可用て形、たい、ない形等基础语法",
    "N3": "N3（中级）：自然口语，可用常见敬语与复合句",
    "N2": "N2（中高级）：自然流畅的口语，可用惯用表达与较复杂的语法",
    "N1": "N1（高级）：接近母语者的自然表达，可用地道的惯用语",
}

SYSTEM = """你是一位亲切的日本人会话伙伴「{persona}」，正在和一位中国学习者做日语口语练习。
场景：{scenario}
学习者水平：{level}

你每次回复都由四个部分组成，必须严格照下面的示例排版（示例只展示排版，内容要换成你自己的），不要使用 Markdown，不要在示例之外多写任何话：

示例（场景：便利店）
いらっしゃいませ。お弁当は温めますか？
[ZH]
欢迎光临。便当要加热吗？
[FIX]
「お弁当を温める」→「お弁当を温めてください」：请求对方做事要用「〜てください」
[HINT]
はい、お願いします。
はい、おねがいします。
好的，麻烦了。

各部分说明：
1. 第一部分是日语回复，1～3 句，口语自然，像真人聊天，结尾用一个问题或话题把对话接下去。第一行就开始写日语，前面不加名字、冒号或标题。
2. [ZH] 之后是上述日语回复的中文翻译。
3. [FIX] 之后：学习者上一句日语如果有语法、用词或不自然之处，按「原句」→「更自然的说法」：原因 的格式写一句中文，不超过 40 字；没有问题就只写 OK。
4. [HINT] 之后三行：学习者下一句可以说的日语（符合其水平、紧扣当前话题）；这句日语的平假名读音；这句日语的中文意思。

其他规则：
- 学习者如果用中文提问，用简短日语回应并温和引导回到日语。
- 学习者的话可能来自语音识别，个别字可能有误，按上下文理解，不要纠结标点和同音字。
- 如果对话刚开始（还没有学习者发言），用日语打招呼并开启与场景相关的话题，[FIX] 写 OK。"""

TAG = re.compile(r"^\[(ZH|FIX|HINT)\]\s*$", re.M)


def system_prompt(scenario: str, level: str, persona: str) -> str:
    return SYSTEM.format(persona=persona or "さくら", scenario=(scenario or "日常会话").strip()[:60],
                         level=LEVELS.get(level, LEVELS["N4"]))


def build_user(messages: list, max_turns: int = 10) -> str:
    """把历史拼成一段文字喂给命令行（它是一次性调用，没有会话记忆）。"""
    msgs = [m for m in messages if m.get("content", "").strip()][-max_turns * 2:]
    if not msgs:
        return "（学习者刚走进场景，还没有开口。请你按上面的排版，先用日语说第一句话。）"
    lines = []
    for m in msgs:
        who = "会话伙伴" if m["role"] == "assistant" else "学习者"
        lines.append(f"{who}：{m['content'].strip()}")
    return "以下是目前的对话：\n" + "\n".join(lines) + "\n\n请以会话伙伴的身份回复学习者的最后一句，严格按格式输出。"


_PREFIX = re.compile(r"^\s*(?:会話伙伴|会话伙伴|学習者|学习者|[^\s：:「」。！？、]{1,8})[：:]\s*")


def _strip_prefix(t: str) -> str:
    """模型偶尔会模仿历史记录，在回复前加「名字：」，去掉。"""
    return _PREFIX.sub("", t, count=1)


def ja_portion(buf: str) -> str:
    """流式过程中，已经可以安全展示/朗读的日语部分（不含后面的 [ZH] 等标记行）。"""
    i = buf.find("\n[")
    t = buf if i < 0 else buf[:i]
    if len(t) < 10 and ("：" in t or ":" in t) is False and not t.strip() == "":
        # 前缀可能还没写完（如「さくら」后面才跟冒号）：很短且没出现冒号时先别放出去
        return "" if not t.rstrip().endswith(("。", "！", "？", "!", "?")) else t
    return _strip_prefix(t)


def parse(full: str) -> dict:
    parts = TAG.split(full)
    out = {"ja": _strip_prefix(parts[0]).strip(), "zh": "", "fix": "", "hint": None}
    for k in range(1, len(parts) - 1, 2):
        tag, body = parts[k], parts[k + 1].strip()
        if tag == "ZH":
            out["zh"] = body
        elif tag == "FIX":
            out["fix"] = "" if body.upper().startswith("OK") or not body else body
        elif tag == "HINT":
            ls = [x.strip() for x in body.splitlines() if x.strip()]
            if ls:
                out["hint"] = {"ja": ls[0], "kana": ls[1] if len(ls) > 1 else "", "zh": ls[2] if len(ls) > 2 else ""}
    return out
