"""Run the public Berker/Hager/DEHN photo inventory to exhaustion in one invocation."""
import json
from pathlib import Path
import subprocess
import sys

SCRIPTS = Path(__file__).resolve().parent


def collect(script, remaining_key, progress_key, *args):
    stalled = 0
    while True:
        result = subprocess.run(
            [sys.executable, '-B', str(SCRIPTS / script), *args],
            check=True, stdout=subprocess.PIPE, text=True, encoding='utf-8',
        )
        print(result.stdout, end='', flush=True)
        batch = json.loads(result.stdout.splitlines()[-1])
        remaining = batch[remaining_key]
        if not remaining:
            return 0
        stalled = 0 if batch[progress_key] > 0 else stalled + 1
        if stalled == 3:
            return remaining


def main():
    dehn = collect('update_dehn_images.py', 'pending', 'completed', '--limit', '30')
    hager = collect('update_product_images.py', 'unseen_remaining', 'completed',
                    '--limit', '300', '--first-pass')
    print(json.dumps({'hager_unseen': hager, 'dehn_pending': dehn}), flush=True)
    return int(bool(hager or dehn))


if __name__ == '__main__':
    sys.exit(main())
