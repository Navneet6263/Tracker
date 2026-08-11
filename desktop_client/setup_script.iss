; Per-machine Sentinel installer. Standard Windows users need administrator
; credentials to install, stop protected files, or uninstall the application.

[Setup]
AppId={{8F4C2A1E-9A3B-4C2D-8E1F-7A6B5C4D3E2F}
AppName=Sentinel Employee Tracker
AppVersion=2.3
AppPublisher=Sentinel Systems
DefaultDirName={autopf}\Sentinel Employee Tracker
DefaultGroupName=Sentinel Employee Tracker
DisableProgramGroupPage=yes
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=EmployeeTrackerSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\EmployeeTracker.exe
DisableReadyPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\EmployeeTracker.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\TrackerWatchdog.exe"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{commonappdata}\SentinelTracker\organization.json"

[Icons]
Name: "{autoprograms}\Sentinel Employee Tracker"; Filename: "{app}\EmployeeTracker.exe"; Parameters: "--resume-tracking"

[Registry]
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SentinelEmployeeTracker"; ValueData: """{app}\EmployeeTracker.exe"" --resume-tracking"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\EmployeeTracker.exe"; Parameters: "--resume-tracking"; Description: "{cm:LaunchProgram,Sentinel Employee Tracker}"; Flags: nowait postinstall skipifsilent runascurrentuser

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM TrackerWatchdog.exe /F"; Flags: runhidden waituntilterminated; RunOnceId: "StopWatchdog"
Filename: "{cmd}"; Parameters: "/C taskkill /IM EmployeeTracker.exe /F"; Flags: runhidden waituntilterminated; RunOnceId: "StopTracker"
