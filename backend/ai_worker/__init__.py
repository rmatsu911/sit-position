"""SYSKEN AI Worker（施工写真 物体検出 PoC）。

施工管理Backend（FastAPI）とは分離した別プロセス。
ai_analysis_jobs の QUEUED を取得し、Predictor で推論して ai_predictions を書き込む。
Worker停止中でも施工管理Backendは正常に動作する（本体はWorkerに依存しない）。
"""
