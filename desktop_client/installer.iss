[Setup]
AppName=Employee Tracker
AppVersion=1.0
DefaultDirName={pf}\EmployeeTracker
DefaultGroupName=Employee Tracker
OutputBaseFilename=TrackerSetup
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\main.exe"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "{app}\main.exe"; Description: "Launch Tracker"; Flags: nowait postinstall skipifsilent

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "EmployeeTracker"; \
  ValueData: "{app}\main.exe"; Flags: uninsdeletevalue
