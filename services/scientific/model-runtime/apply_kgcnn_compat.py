"""Apply the audited Keras Core 0.1.7 compatibility adapter to one pinned tree."""

from pathlib import Path
import sys


def replace_once(path: Path, expected: str, replacement: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(expected)
    if count != 1:
        raise RuntimeError(f"Unexpected upstream source shape in {path}: expected one match, found {count}.")
    path.write_text(source.replace(expected, replacement), encoding="utf-8")


def main(root: Path) -> None:
    replace_once(
        root / "kgcnn/ops_core/core.py",
        "from keras_core.ops import any_symbolic_tensors\nfrom keras_core.ops.numpy import Repeat",
        "from keras_core import ops\nfrom keras_core.src.backend import any_symbolic_tensors",
    )
    replace_once(
        root / "kgcnn/ops_core/core.py",
        "Repeat(repeats, axis=axis).symbolic_call(x)",
        "ops.repeat(x, repeats, axis=axis)",
    )
    replace_once(
        root / "kgcnn/ops_core/scatter.py",
        "from keras_core.backend import KerasTensor\nfrom keras_core.backend import any_symbolic_tensors\nfrom keras_core.ops.operation import Operation",
        "from keras_core.src.backend import KerasTensor, any_symbolic_tensors\nfrom keras_core.src.ops.operation import Operation",
    )
    replace_once(
        root / "kgcnn/layers_core/casting.py",
        "from keras_core import ops\n",
        "from keras_core import ops\nfrom keras_core.src.backend import is_tensor\n",
    )
    casting = root / "kgcnn/layers_core/casting.py"
    source = casting.read_text(encoding="utf-8")
    expected = "ops.is_tensor(x)"
    if source.count(expected) != 2:
        raise RuntimeError("Unexpected KGCNN casting implementation; refusing compatibility adaptation.")
    casting.write_text(source.replace(expected, "is_tensor(x)"), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: apply_kgcnn_compat.py <pinned-kgcnn-root>")
    main(Path(sys.argv[1]))
