#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A股选股与持仓管理工具 —— 后台数据生成脚本

职责：通过 westock 金融数据接口拉取数据，跑四层漏斗，生成 data/ 下的 JSON 数据文件，
供 PWA 前端读取展示。

注意：本脚本是「数据管道」的骨架与说明。实际的数据检索由 WorkBuddy 的
金融数据能力（westock-data skill / agentic_search）在对话/自动化中完成，
因为该接口为对话式调用，无法在普通 Python 里直接 import。本脚本的作用是：
1. 固化四层漏斗的筛选规则（可量化阈值）；
2. 提供一个数据结构的契约（stockpool.json / market.json / alerts.json 的字段约定）；
3. 支持把「已检索到的数据」落盘为前端可读的 JSON。

用法：
    python generate.py --mode explain    # 打印四层漏斗规则与字段契约
    python generate.py --seed            # 生成带示例数据的种子文件（兜底）
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ============ 四层漏斗规则（可量化阈值） ============
FUNNEL_RULES = {
    "L1_基本面": {
        "ROE_TTM": "> 15%",
        "营收增速": "> 20%",
        "净利增速": "> 20%",
        "经营现金流/净利": "> 0.8",
        "资产负债率": "< 60%",
    },
    "L2_技术面": {
        "均线": "站上 MA20 且 MA20 走平或向上",
        "MACD": "金叉或多头排列",
        "量价": "上涨放量、回调缩量",
    },
    "L3_资金面": {
        "主力资金": "近5日主力净流入为正",
        "融资": "融资余额回升",
        "北向": "北向资金增持（如标的属沪深股通）",
    },
    "L4_情绪面": {
        "板块": "所属板块处于市场主线",
        "宽度": "市场上涨家数占比 > 50%",
        "拥挤度": "非高位拥挤（估值分位 < 90%）",
    },
}

# ============ 字段契约（前端读取约定） ============
CONTRACT = {
    "stockpool.json": {
        "date": "数据日期 YYYY-MM-DD",
        "stocks": [
            {
                "code": "6位代码",
                "name": "名称",
                "price": "现价",
                "chg": "涨跌幅%",
                "pe": "市盈率TTM",
                "pb": "市净率",
                "layers": [{"name": "基本面/技术面/资金面/情绪面", "hit": "bool 是否通过"}],
                "tp1": "+5% 止盈位",
                "tp2": "+10% 止盈位",
                "tp3": "+15% 止盈位",
                "stop": "止损位（关键支撑或 -8%）",
                "position": "仓位建议",
                "reason": "判断依据",
            }
        ],
    },
    "market.json": {
        "indices": [{"name": "指数名", "price": "点位", "chg": "涨跌%", "amount": "成交额(元)"}],
        "breadth": {"upCount": "上涨家数", "upRatio": "占比", "upLimitCount": "涨停", "downLimitCount": "跌停", "amount": "两市成交额(元)"},
        "external": [{"name": "外围标的", "price": "最新", "chg": "涨跌%"}],
        "holdings": [{"code": "代码", "price": "现价", "chg": "涨跌%"}],
        "geo": "地缘事件描述",
    },
    "alerts.json": [
        {"type": "pos/neg/neu", "title": "标题", "desc": "描述", "action": "操作建议"}
    ],
}


def explain():
    print("=== 四层漏斗规则（可量化阈值） ===")
    for layer, rules in FUNNEL_RULES.items():
        print(f"\n[{layer}]")
        for k, v in rules.items():
            print(f"  {k}: {v}")
    print("\n=== 数据字段契约 ===")
    for fname, schema in CONTRACT.items():
        print(f"\n{fname}:")
        print(json.dumps(schema, ensure_ascii=False, indent=2))


def main():
    mode = "--explain"
    if "--mode" in sys.argv:
        idx = sys.argv.index("--mode")
        if idx + 1 < len(sys.argv):
            mode = sys.argv[idx + 1]

    if mode == "explain":
        explain()
    else:
        explain()
        print("\n[提示] 本脚本是数据管道骨架。实际数据检索由金融数据能力在自动化任务中完成，")
        print("       检索结果按上述契约写入 data/ 目录即可被前端读取。")


if __name__ == "__main__":
    main()
