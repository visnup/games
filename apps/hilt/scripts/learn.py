# /// script
# dependencies = ["lightgbm", "numpy"]
# ///
"""Fits `src/learned.ts`'s move scorer to `dataset.ts`'s shards and writes the trees to
`dataset/model.json`. `uv run scripts/learn.py [trees] [out] [data directories…]`. Holds out the
last directory's last 8 shards of each player count, and reports the playout value the model's
pick gains over the default's there. LightGBM needs `brew install libomp`."""

import json
import os
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np

trees = int(sys.argv[1]) if len(sys.argv) > 1 else 500
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent.parent / "dataset" / "model.json"
dirs = [Path(d) for d in sys.argv[3:]] or [Path(__file__).parent.parent / "dataset" / "data"]
data = dirs[-1]


version = 1
# version 2's rows fit as version 1, without card counting: its 13 unseen counts and 1 move number
as_v1 = os.environ.get("V1") == "1"


def read(files):
    global version
    X, Y, groups = [], [], []
    for f in files:
        for line in f.open():
            r = json.loads(line)
            version = r.get("v", 1)
            board, moves = r["board"], r["moves"]
            if as_v1 and version == 2:
                version, board, moves = 1, board[:-13], [m[:-2] + m[-1:] for m in moves]
            groups.append(len(moves))
            for m, v in zip(moves, r["values"]):
                X.append(board + m)
                Y.append(v)
    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32), groups


shards = sorted(data.glob("*.jsonl"))
counts = sorted({f.name.split("p-")[0] for f in shards})
held = {c: sorted(f for f in shards if f.name.startswith(f"{c}p-"))[-8:] for c in counts}
train_files = [f for d in dirs for f in sorted(d.glob("*.jsonl")) if not any(f in h for h in held.values())]
X, Y, _ = read(train_files)
heldout = {c: read(fs) for c, fs in held.items()}
Xh = np.concatenate([h[0] for h in heldout.values()])
Yh = np.concatenate([h[1] for h in heldout.values()])
print(f"{len(X)} moves to train on, {len(Xh)} held out", flush=True)

train = lgb.Dataset(X, Y, free_raw_data=False)
model = lgb.train(
    {"learning_rate": 0.1, "num_leaves": 63, "min_data_in_leaf": 200, "verbose": -1},
    train,
    num_boost_round=trees,
    valid_sets=[lgb.Dataset(Xh, Yh, reference=train)],
    callbacks=[lgb.early_stopping(20), lgb.log_evaluation(50)],
)
out.write_text(json.dumps({"v": version, "tree_info": [{"tree_structure": t["tree_structure"]} for t in model.dump_model(num_iteration=model.best_iteration)["tree_info"]]}))

default = len(X[0]) - 1
print("\nheld out, points of win chance a decision over the default's pick (model's pick, and the best move's, which is noisy):")
for c, (x, y, groups) in heldout.items():
    p = model.predict(x, num_iteration=model.best_iteration)
    gain = best = 0.0
    at = 0
    for g in groups:
        ys, ps, d = y[at : at + g], p[at : at + g], x[at : at + g, default]
        dv = ys[d == 1].mean() if (d == 1).any() else ys.mean()
        gain += ys[ps.argmax()] - dv
        best += ys.max() - dv
        at += g
    print(f"  {c} players: {100 * gain / len(groups):+.2f} (best {100 * best / len(groups):+.2f}) on {len(groups)} decisions")
