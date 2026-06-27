# -*- coding: utf-8 -*-
"""
analyze.py
读取广东省省级以上非遗代表性项目名录 .xls，
筛选"传统体育、游艺与杂技"类项目，聚合拳种数据，
并写入 js/data.js，供前端引用。

输入：与脚本同目录下或上层目录的 xls 文件
输出：../js/data.js
"""

import os
import json
import xlrd


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

XLS_CANDIDATES = [
    os.path.join(ROOT, "1734684349991广东省省级以上非物质文化遗产代表性项目名录.xls"),
    os.path.join(os.path.dirname(ROOT), "1734684349991广东省省级以上非物质文化遗产代表性项目名录.xls"),
]
OUT_JS = os.path.join(ROOT, "js", "data.js")


# -------------------- 广东 21 地市经纬度（近似） --------------------
# 坐标取自各市政府驻地大致位置（lat, lon），用于前端画气泡地图。
CITIES = [
    # name, lat, lon, isCore
    ("广州", 23.1291, 113.2644, True),
    ("深圳", 22.5431, 114.0579, False),
    ("珠海", 22.2710, 113.5767, False),
    ("汕头", 23.3535, 116.6818, False),
    ("佛山", 23.0218, 113.1219, True),
    ("韶关", 24.8108, 113.5972, False),
    ("河源", 23.7434, 114.7000, False),
    ("梅州", 24.2886, 116.1226, False),
    ("惠州", 23.1115, 114.4161, True),
    ("汕尾", 22.7787, 115.3756, False),
    ("东莞", 23.0207, 113.7518, False),
    ("中山", 22.5176, 113.3927, False),
    ("江门", 22.5787, 113.0817, True),
    ("阳江", 21.8579, 111.9826, False),
    ("湛江", 21.2707, 110.3594, False),
    ("茂名", 21.6629, 110.9255, False),
    ("肇庆", 23.0470, 112.4654, False),
    ("清远", 23.6817, 113.0563, False),
    ("潮州", 23.6618, 116.6224, False),
    ("揭阳", 23.5498, 116.3728, False),
    ("云浮", 22.9151, 112.0445, False),
]


# -------------------- 名称归一化 --------------------
# Excel 中的"申报地区"可能是多地联合，如"东莞、惠州市"。
# 这里统一按"市 / 县 / 区"边界切分。
def split_regions(s):
    if not s:
        return []
    # 替换各种分隔符
    s = str(s).replace("、", ",").replace("，", ",").replace(" ", "")
    parts = [p for p in s.split(",") if p]
    # 去掉"广东省"这种前缀
    parts = [p.replace("广东省", "") for p in parts]
    return parts


def region_to_city(region):
    """把申报地区字符串映射到 21 地市之一（取第一个匹配的地市）。"""
    if not region:
        return None
    r = str(region)
    for city, _, _, _ in CITIES:
        if city in r:
            return city
    # 县区映射：例如"南海区" -> 佛山
    district_map = {
        "南海": "佛山", "顺德": "佛山", "禅城": "佛山", "三水": "佛山", "高明": "佛山",
        "天河": "广州", "越秀": "广州", "荔湾": "广州", "海珠": "广州", "白云": "广州",
        "黄埔": "广州", "番禺": "广州", "花都": "广州", "从化": "广州", "增城": "广州",
        "鹤山": "江门", "新会": "江门", "台山": "江门", "开平": "江门", "恩平": "江门", "江海": "江门", "蓬江": "江门",
        "惠城": "惠州", "惠阳": "惠州", "惠东": "惠州", "博罗": "惠州", "龙门": "惠州",
        "莞城": "东莞", "东城": "东莞", "南城": "东莞",
    }
    for k, v in district_map.items():
        if k in r:
            return v
    return None


# -------------------- 拳种归一化 --------------------
def normalize_style(name):
    """提取拳种主名。例如 '咏春拳（鹤山咏春拳）' -> '咏春拳'。"""
    if not name:
        return ""
    s = str(name).strip()
    # 处理括号
    for sep in ["（", "("]:
        if sep in s:
            s = s.split(sep)[0].strip()
    # 去掉"拳"后面无意义的附加
    return s


# -------------------- 主流程 --------------------
def main():
    xls_path = None
    for p in XLS_CANDIDATES:
        if os.path.exists(p):
            xls_path = p
            break
    if not xls_path:
        raise FileNotFoundError("找不到 xls 数据文件")

    wb = xlrd.open_workbook(xls_path)
    sh = wb.sheet_by_name(wb.sheet_names()[0])

    # 列：0=序号, 1=项目类别, 2=项目名称, 3=申报/地区, 4=省级批次, 5=国家级批次, 6=备注
    # 表头在第 3 行（index 2），数据从 index 3 开始
    rows = []
    for i in range(3, sh.nrows):
        row = sh.row_values(i)
        cat = str(row[1]).strip() if row[1] else ""
        if "传统体育" not in cat and "游艺" not in cat and "杂技" not in cat:
            continue
        rows.append({
            "no": row[0],
            "category": cat,
            "name": str(row[2]).strip() if row[2] else "",
            "region": str(row[3]).strip() if row[3] else "",
            "prov_batch": _to_int(row[4]),
            "nat_batch": _to_int_or_str(row[5]),
            "remark": str(row[6]).strip() if len(row) > 6 and row[6] else "",
        })

    # 按城市聚合
    city_count = {c[0]: 0 for c in CITIES}
    city_items = {c[0]: [] for c in CITIES}
    style_count = {}
    detail = []

    for r in rows:
        cities = split_regions(r["region"])
        # 至少映射到一个 21 地市
        mapped = []
        for c in cities:
            mc = region_to_city(c)
            if mc and mc not in mapped:
                mapped.append(mc)
        # 兜底：region_to_city 整个串尝试
        if not mapped:
            mc = region_to_city(r["region"])
            if mc:
                mapped = [mc]

        # 归一化拳种名
        style = normalize_style(r["name"])
        if not style:
            style = r["name"]
        style_count[style] = style_count.get(style, 0) + 1

        for c in mapped:
            city_count[c] = city_count.get(c, 0) + 1
            city_items[c].append({
                "name": r["name"],
                "style": style,
                "prov": r["prov_batch"],
                "nat": r["nat_batch"],
            })

        detail.append({
            "name": r["name"],
            "style": style,
            "region": r["region"],
            "cities": mapped,
            "prov": r["prov_batch"],
            "nat": r["nat_batch"],
            "remark": r["remark"],
            "isJoint": len(mapped) > 1,
        })

    # 批次堆叠：1-8 批省级 vs 1-5 批国家级
    prov_dist = {i: 0 for i in range(1, 9)}
    nat_dist = {i: 0 for i in range(1, 6)}
    for r in rows:
        if isinstance(r["prov_batch"], int):
            prov_dist[r["prov_batch"]] = prov_dist.get(r["prov_batch"], 0) + 1
        if isinstance(r["nat_batch"], int):
            nat_dist[r["nat_batch"]] = nat_dist.get(r["nat_batch"], 0) + 1

    # 核心区 vs 其他
    core_cities = {c[0] for c in CITIES if c[3]}
    core_total = sum(city_count[c] for c in core_cities)
    other_total = sum(city_count[c] for c in city_count if c not in core_cities)

    # 写出
    payload = {
        "meta": {
            "totalWushu": len(rows),
            "coreCities": sorted(list(core_cities)),
            "coreTotal": core_total,
            "otherTotal": other_total,
            "jointProtect": [d for d in detail if d["isJoint"]],
        },
        "cities": [
            {"name": c[0], "lat": c[1], "lon": c[2], "isCore": c[3], "count": city_count[c[0]]}
            for c in CITIES
        ],
        "cityItems": {c: city_items[c] for c in city_items},
        "byStyle": [{"style": k, "count": v} for k, v in
                    sorted(style_count.items(), key=lambda x: -x[1])],
        "byBatch": {
            "prov": [{"batch": b, "count": prov_dist[b]} for b in range(1, 9)],
            "nat":  [{"batch": b, "count": nat_dist[b]} for b in range(1, 6)],
        },
        "detail": detail,
    }

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("// 由 data/analyze.py 自动生成，请勿手工修改。\n")
        f.write("window.WUSHU_DATA = ")
        f.write(json.dumps(payload, ensure_ascii=False, indent=2))
        f.write(";\n")

    print(f"OK. 行数：{len(rows)} -> 写入 {OUT_JS}")
    print("城市 Top5：")
    for c in sorted(payload["cities"], key=lambda x: -x["count"])[:5]:
        print(f"  {c['name']}: {c['count']}")
    print("拳种 Top8：")
    for s in payload["byStyle"][:8]:
        print(f"  {s['style']}: {s['count']}")
    print(f"核心区合计：{core_total}，其他合计：{other_total}")
    print(f"联合保护项目：{len(payload['meta']['jointProtect'])} 条")


def _to_int(v):
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def _to_int_or_str(v):
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return str(v).strip()


if __name__ == "__main__":
    main()
