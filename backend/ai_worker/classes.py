"""クラス体系のローダ。

クラス定義はコードにハードコードせず、datasets/data.yaml（YOLO Dataset metadata）を正とする。
data.yaml が読めない場合のみ、PoC既定クラスにフォールバックする。
"""
from __future__ import annotations

import os
from functools import lru_cache

# data.yaml が無いときの PoC 既定（＝datasets/data.yaml と同一に保つ）
_DEFAULT_NAMES = {
    0: "utility_pole",
    1: "optical_cable",
    2: "closure",
    3: "onu",
    4: "optical_termination_box",
}
_DEFAULT_DISPLAY = {
    "utility_pole": "電柱",
    "optical_cable": "光ケーブル",
    "closure": "クロージャ",
    "onu": "ONU",
    "optical_termination_box": "光成端箱",
}


class ClassMap:
    def __init__(self, names: dict[int, str], display: dict[str, str]):
        self.names = names  # index -> code
        self.display = display  # code -> 表示名

    def label(self, class_id: int) -> str:
        code = self.names.get(class_id, str(class_id))
        return self.display.get(code, code)

    def code(self, class_id: int) -> str:
        return self.names.get(class_id, str(class_id))

    @property
    def num_classes(self) -> int:
        return len(self.names)


@lru_cache
def load_class_map(data_yaml: str | None = None) -> ClassMap:
    from app.core.config import settings

    path = data_yaml or settings.ai_data_yaml
    try:
        import yaml  # PyYAML

        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        raw_names = data.get("names", {})
        # names は {0: code} でも [code,...] でも受ける
        if isinstance(raw_names, list):
            names = {i: n for i, n in enumerate(raw_names)}
        else:
            names = {int(k): v for k, v in raw_names.items()}
        display = data.get("display", {}) or {}
        if names:
            return ClassMap(names=names, display=display)
    except (FileNotFoundError, ImportError, Exception):  # noqa: BLE001
        pass
    return ClassMap(names=dict(_DEFAULT_NAMES), display=dict(_DEFAULT_DISPLAY))
