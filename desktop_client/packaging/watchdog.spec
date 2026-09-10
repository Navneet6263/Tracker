from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis([str(root / 'watchdog.py')], pathex=[str(root)], binaries=[], datas=[],
             hiddenimports=[], hookspath=[], runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='TrackerWatchdog',
          debug=False, strip=False, upx=False, console=False)
