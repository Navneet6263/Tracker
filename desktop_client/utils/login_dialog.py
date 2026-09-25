import os
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path

CONFIG_DIR = Path(os.getenv("APPDATA") or os.path.expanduser("~")) / "SentinelTracker"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
LAST_EMAIL_FILE = CONFIG_DIR / "last_email.txt"


def get_last_email() -> str:
    try:
        if LAST_EMAIL_FILE.exists():
            return LAST_EMAIL_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return ""


def save_last_email(email: str):
    try:
        LAST_EMAIL_FILE.write_text(email.strip(), encoding="utf-8")
    except Exception:
        pass


def prompt_user_checkin() -> tuple[str, str] | tuple[None, None]:
    """
    Displays a modern check-in popup window asking the employee for their official email.
    Blocks until submitted or cancelled. Returns (email, name).
    """
    result = {"email": None, "name": None}

    root = tk.Tk()
    root.title("Sentinel Tracker - Agent Check-In")
    root.geometry("440x360")
    root.resizable(False, False)
    root.configure(bg="#0f172a")  # Dark slate modern background

    # Center on screen
    root.update_idletasks()
    width = 440
    height = 360
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")
    root.attributes("-topmost", True)

    # Main Card Container
    card = tk.Frame(root, bg="#1e293b", padx=28, pady=24)
    card.pack(fill="both", expand=True, padx=14, pady=14)

    # Header Badge / Title
    title_lbl = tk.Label(
        card,
        text="🛡️ Sentinel Workforce Tracker",
        font=("Segoe UI", 14, "bold"),
        fg="#38bdf8",
        bg="#1e293b",
    )
    title_lbl.pack(anchor="w")

    subtitle_lbl = tk.Label(
        card,
        text="Please enter your official email to start your shift",
        font=("Segoe UI", 9),
        fg="#94a3b8",
        bg="#1e293b",
    )
    subtitle_lbl.pack(anchor="w", pady=(2, 16))

    # Email Field
    email_lbl = tk.Label(
        card,
        text="Official Work Email *",
        font=("Segoe UI", 10, "bold"),
        fg="#f1f5f9",
        bg="#1e293b",
    )
    email_lbl.pack(anchor="w")

    email_entry = tk.Entry(
        card,
        font=("Segoe UI", 11),
        bg="#0f172a",
        fg="#ffffff",
        insertbackground="#38bdf8",
        relief="flat",
        highlightthickness=1,
        highlightbackground="#475569",
        highlightcolor="#38bdf8",
    )
    email_entry.pack(fill="x", pady=(4, 12), ipady=6)

    last_email = get_last_email()
    if last_email:
        email_entry.insert(0, last_email)
        email_entry.select_range(0, tk.END)

    # Name Field (Optional)
    name_lbl = tk.Label(
        card,
        text="Your Full Name (Optional)",
        font=("Segoe UI", 10),
        fg="#cbd5e1",
        bg="#1e293b",
    )
    name_lbl.pack(anchor="w")

    name_entry = tk.Entry(
        card,
        font=("Segoe UI", 11),
        bg="#0f172a",
        fg="#ffffff",
        insertbackground="#38bdf8",
        relief="flat",
        highlightthickness=1,
        highlightbackground="#475569",
        highlightcolor="#38bdf8",
    )
    name_entry.pack(fill="x", pady=(4, 10), ipady=6)

    # Error Label
    err_lbl = tk.Label(
        card,
        text="",
        font=("Segoe UI", 9),
        fg="#f87171",
        bg="#1e293b",
    )
    err_lbl.pack(anchor="w", pady=(0, 8))

    def on_submit(event=None):
        email = email_entry.get().strip().lower()
        name = name_entry.get().strip()

        if not email or "@" not in email or "." not in email:
            err_lbl.config(text="⚠️ Please enter a valid work email (e.g. employee@company.com)")
            email_entry.focus_set()
            return


        if not name:
            # Auto generate friendly name from email local part
            local = email.split("@")[0]
            name = local.replace(".", " ").replace("-", " ").replace("_", " ").title()

        save_last_email(email)
        result["email"] = email
        result["name"] = name
        root.destroy()

    def on_close():
        if messagebox.askyesno(
            "Exit Tracker?",
            "Tracking is required for activity recording. Are you sure you want to cancel check-in?",
            parent=root,
        ):
            root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    email_entry.bind("<Return>", on_submit)
    name_entry.bind("<Return>", on_submit)

    # Submit Button
    btn = tk.Button(
        card,
        text="▶ Start Shift / Check In",
        font=("Segoe UI", 11, "bold"),
        bg="#10b981",
        fg="#ffffff",
        activebackground="#059669",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        command=on_submit,
    )
    btn.pack(fill="x", ipady=8, pady=(4, 0))

    email_entry.focus_set()
    root.mainloop()

    return result["email"], result["name"]


def prompt_shift_end_dialog(employee_name: str, shift_name: str, shift_start: str, shift_end: str) -> bool:
    """
    Displays an interactive popup when the scheduled shift ends.
    Returns True if agent wants to check out / end shift, False to continue working (overtime).
    """
    result = {"end_shift": False}

    root = tk.Tk()
    root.title("Sentinel Tracker - Shift Over")
    root.geometry("440x330")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    root.update_idletasks()
    width = 440
    height = 330
    x = (root.winfo_screenwidth() // 2) - (width // 2)
    y = (root.winfo_screenheight() // 2) - (height // 2)
    root.geometry(f"{width}x{height}+{x}+{y}")
    root.attributes("-topmost", True)

    card = tk.Frame(root, bg="#1e293b", padx=24, pady=20)
    card.pack(fill="both", expand=True, padx=14, pady=14)

    title_lbl = tk.Label(
        card,
        text="⏰ Shift Completed",
        font=("Segoe UI", 14, "bold"),
        fg="#fbbf24",  # Amber gold
        bg="#1e293b",
    )
    title_lbl.pack(anchor="w")

    subtitle_lbl = tk.Label(
        card,
        text=f"Hello {employee_name}, your scheduled shift has ended.",
        font=("Segoe UI", 9, "bold"),
        fg="#f1f5f9",
        bg="#1e293b",
    )
    subtitle_lbl.pack(anchor="w", pady=(4, 8))

    info_frame = tk.Frame(card, bg="#0f172a", padx=12, pady=10)
    info_frame.pack(fill="x", pady=(0, 14))

    shift_info = f"Shift: {shift_name} ({shift_start} - {shift_end})" if shift_start else f"Shift: {shift_name}"
    tk.Label(
        info_frame,
        text=shift_info,
        font=("Segoe UI", 9),
        fg="#94a3b8",
        bg="#0f172a",
    ).pack(anchor="w")

    tk.Label(
        info_frame,
        text="Automatic stop is disabled. Work continues until you choose to check out.",
        font=("Segoe UI", 8),
        fg="#38bdf8",
        bg="#0f172a",
    ).pack(anchor="w", pady=(2, 0))

    prompt_lbl = tk.Label(
        card,
        text="Would you like to End Shift and Check Out now?",
        font=("Segoe UI", 9),
        fg="#cbd5e1",
        bg="#1e293b",
    )
    prompt_lbl.pack(anchor="w", pady=(0, 14))

    btn_frame = tk.Frame(card, bg="#1e293b")
    btn_frame.pack(fill="x")

    def on_end():
        result["end_shift"] = True
        root.destroy()

    def on_continue():
        result["end_shift"] = False
        root.destroy()

    # Red/Rose End Shift Button
    btn_end = tk.Button(
        btn_frame,
        text="⏹ End Shift & Check Out",
        font=("Segoe UI", 10, "bold"),
        bg="#e11d48",
        fg="#ffffff",
        activebackground="#be123c",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        command=on_end,
    )
    btn_end.pack(fill="x", ipady=6, pady=(0, 8))

    # Blue Continue Button
    btn_continue = tk.Button(
        btn_frame,
        text="▶ Continue Working (Overtime)",
        font=("Segoe UI", 10),
        bg="#334155",
        fg="#ffffff",
        activebackground="#475569",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        command=on_continue,
    )
    btn_continue.pack(fill="x", ipady=5)

    root.protocol("WM_DELETE_WINDOW", on_continue)
    root.mainloop()

    return result["end_shift"]


if __name__ == "__main__":
    email, name = prompt_user_checkin()
    print("Checked in:", email, name)
