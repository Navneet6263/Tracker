; Inno Setup Script for Sentinel Employee Tracker
; Download Inno Setup (Free) from https://jrsoftware.org/isdl.php to compile this script.

[Setup]
AppId={{8F4C2A1E-9A3B-4C2D-8E1F-7A6B5C4D3E2F}
AppName=Sentinel Employee Tracker
AppVersion=1.0
AppPublisher=Sentinel Systems
DefaultDirName={autopf}\Sentinel Employee Tracker
DefaultGroupName=Sentinel Employee Tracker
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=EmployeeTrackerSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\EmployeeTracker.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Sentinel Employee Tracker"; Filename: "{app}\EmployeeTracker.exe"

[Run]
Filename: "{app}\EmployeeTracker.exe"; Description: "{cm:LaunchProgram,Sentinel Employee Tracker}"; Flags: nowait postinstall skipifsilent
