; Upgrade using the existing AppId, but preserve the legacy release artifact.
[Setup]
AppId={{8F4C2A1E-9A3B-4C2D-8E1F-7A6B5C4D3E2F}
AppName=Sentinel Employee Tracker
AppVersion=3.1
AppPublisher=Sentinel Systems
DefaultDirName={autopf}\Sentinel Employee Tracker
DefaultGroupName=Sentinel Employee Tracker
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=EmployeeTrackerSharedSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\EmployeeTracker.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\shared\EmployeeTracker.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\shared\TrackerWatchdog.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Sentinel Employee Tracker"; Filename: "{app}\EmployeeTracker.exe"; Parameters: "--resume-tracking"

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SentinelEmployeeTracker"; ValueData: """{app}\EmployeeTracker.exe"" --resume-tracking"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\EmployeeTracker.exe"; Parameters: "--resume-tracking"; Description: "Start shared-PC sign-in"; Flags: nowait postinstall skipifsilent runascurrentuser

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM TrackerWatchdog.exe /F"; Flags: runhidden waituntilterminated; RunOnceId: "StopWatchdog"
Filename: "{cmd}"; Parameters: "/C taskkill /IM EmployeeTracker.exe /F"; Flags: runhidden waituntilterminated; RunOnceId: "StopTracker"
