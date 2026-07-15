import sys
import time
import subprocess
import psutil
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: watchdog.py <main_pid> <main_executable_path>")
        return

    main_pid = int(sys.argv[1])
    main_exe_path = sys.argv[2]

    # Wait a moment to ensure the main process is fully registered if it just started
    time.sleep(2)

    while True:
        # Check if the main process is still running
        is_running = False
        try:
            p = psutil.Process(main_pid)
            if p.is_running() and p.status() != psutil.STATUS_ZOMBIE:
                is_running = True
        except psutil.NoSuchProcess:
            pass
        except Exception:
            pass

        if not is_running:
            # Main process died! Restart it!
            try:
                print(f"Watchdog: Main process {main_pid} died. Restarting {main_exe_path}...")
                
                # Restart the main process.
                if main_exe_path.endswith('.py'):
                    # If running as script, use python executable
                    new_p = subprocess.Popen([sys.executable, main_exe_path, "--from-watchdog"], 
                                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
                else:
                    # If running as compiled exe
                    new_p = subprocess.Popen([main_exe_path, "--from-watchdog"], 
                                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
                
                main_pid = new_p.pid
                print(f"Watchdog: Restarted main process with new PID {main_pid}")
            except Exception as e:
                print(f"Watchdog: Failed to restart main process: {e}")
        
        time.sleep(2)  # Check every 2 seconds

if __name__ == "__main__":
    main()
