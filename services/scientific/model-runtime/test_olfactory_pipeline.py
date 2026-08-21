from pathlib import Path

from olfactory_pipeline import run_pipeline


def test_phase5_fusion_pipeline_has_groups_metrics_and_calibration():
    report = run_pipeline(Path("/opt/fixtures/dravnieks_benchmark.csv"))
    assert report["rows"] == 24
    assert report["leakageStatus"] == "PASS"
    assert all(count > 0 for count in report["partitions"].values())
    assert report["representations"]["fusion"] == "late_fusion_concatenation"
    assert report["odorEmbedding"]["dimension"] == 2
    assert report["serving"] == "RESEARCH_ONLY"
    assert len(report["contentHash"]) == 64
