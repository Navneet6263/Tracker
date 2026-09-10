# Build from desktop_client: python -m PyInstaller packaging/shared.spec --distpath dist/shared --workpath build/shared
from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis([str(root / 'shared_main.py')], pathex=[str(root)],
             binaries=[], datas=[], hiddenimports=['pycaw.pycaw', 'comtypes', 'win32timezone'],
             hookspath=[], runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='EmployeeTracker',
          debug=False, strip=False, upx=False, console=False)
