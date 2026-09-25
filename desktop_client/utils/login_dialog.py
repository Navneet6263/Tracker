import os
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path

CONFIG_DIR = Path(os.getenv("APPDATA") or os.path.expanduser("~")) / "SentinelTracker"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
LAST_EMAIL_FILE = CONFIG_DIR / "last_email.txt"
LAST_NAME_FILE = CONFIG_DIR / "last_name.txt"


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


def get_last_name() -> str:
    try:
        if LAST_NAME_FILE.exists():
            return LAST_NAME_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return ""


def save_last_name(name: str):
    try:
        LAST_NAME_FILE.write_text(name.strip(), encoding="utf-8")
    except Exception:
        pass


def prompt_user_checkin() -> tuple[str, str]:
    """
    Displays a spacious, enterprise-grade check-in popup window asking the employee for their details.
    Window cannot be closed / cut off until valid credentials are submitted.
    """
    result = {"email": None, "name": None}

    root = tk.Tk()
    root.title("Sentinel Workforce Tracker — Employee Check-In")
    width = 540
    height = 510
    root.geometry(f"{width}x{height}")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    # Center on screen
    root.update_idletasks()
    x = max(0, (root.winfo_screenwidth() // 2) - (width // 2))
    y = max(0, (root.winfo_screenheight() // 2) - (height // 2))
    root.geometry(f"{width}x{height}+{x}+{y}")
    root.attributes("-topmost", True)
    root.lift()
    root.focus_force()

    # Main Card Container
    card = tk.Frame(root, bg="#1e293b", padx=32, pady=26)
    card.pack(fill="both", expand=True, padx=16, pady=16)

    # Header Badge / Title
    header_frame = tk.Frame(card, bg="#1e293b")
    header_frame.pack(fill="x", pady=(0, 10))

    tk.Label(
        header_frame,
        text="🛡️ Sentinel Workforce Tracker",
        font=("Segoe UI", 16, "bold"),
        fg="#38bdf8",
        bg="#1e293b",
    ).pack(anchor="w")

    tk.Label(
        header_frame,
        text="Employee Attendance & Shift Activity Verification",
        font=("Segoe UI", 10),
        fg="#94a3b8",
        bg="#1e293b",
    ).pack(anchor="w", pady=(2, 0))

    # Shift Information Banner
    shift_banner = tk.Frame(card, bg="#0f172a", padx=14, pady=10, highlightthickness=1, highlightbackground="#334155")
    shift_banner.pack(fill="x", pady=(4, 16))

    tk.Label(
        shift_banner,
        text="⏰ Company Shift Timings (Asia/Kolkata):",
        font=("Segoe UI", 9, "bold"),
        fg="#fbbf24",
        bg="#0f172a",
    ).pack(anchor="w")

    tk.Label(
        shift_banner,
        text="• Day Shift: 09:00 AM – 06:00 PM    • Night Shift: 08:00 PM – 06:00 AM",
        font=("Segoe UI", 9),
        fg="#cbd5e1",
        bg="#0f172a",
    ).pack(anchor="w", pady=(2, 0))

    # Name Field
    tk.Label(
        card,
        text="Full Name *",
        font=("Segoe UI", 10, "bold"),
        fg="#f1f5f9",
        bg="#1e293b",
    ).pack(anchor="w")

    name_entry = tk.Entry(
        card,
        font=("Segoe UI", 12),
        bg="#0f172a",
        fg="#ffffff",
        insertbackground="#38bdf8",
        relief="flat",
        highlightthickness=1,
        highlightbackground="#475569",
        highlightcolor="#38bdf8",
    )
    name_entry.pack(fill="x", pady=(4, 12), ipady=7)

    last_name = get_last_name()
    if last_name:
        name_entry.insert(0, last_name)

    # Email Field
    tk.Label(
        card,
        text="Official Work Email *",
        font=("Segoe UI", 10, "bold"),
        fg="#f1f5f9",
        bg="#1e293b",
    ).pack(anchor="w")

    email_entry = tk.Entry(
        card,
        font=("Segoe UI", 12),
        bg="#0f172a",
        fg="#ffffff",
        insertbackground="#38bdf8",
        relief="flat",
        highlightthickness=1,
        highlightbackground="#475569",
        highlightcolor="#38bdf8",
    )
    email_entry.pack(fill="x", pady=(4, 8), ipady=7)

    last_email = get_last_email()
    if last_email:
        email_entry.insert(0, last_email)

    # Error Label
    err_lbl = tk.Label(
        card,
        text="",
        font=("Segoe UI", 9, "bold"),
        fg="#f87171",
        bg="#1e293b",
    )
    err_lbl.pack(anchor="w", pady=(0, 6))

    def on_submit(event=None):
        name = name_entry.get().strip()
        email = email_entry.get().strip().lower()

        if not name:
            err_lbl.config(text="⚠️ Please enter your Full Name")
            name_entry.focus_set()
            return

        if not email or "@" not in email or "." not in email:
            err_lbl.config(text="⚠️ Please enter a valid official email (e.g. name@company.com)")
            email_entry.focus_set()
            return

        save_last_name(name)
        save_last_email(email)
        result["name"] = name
        result["email"] = email
        root.destroy()

    # Prevent user from closing / cutting the window without checking in
    def on_prevent_close():
        messagebox.showwarning(
            "Check-In Mandatory",
            "Attendance & activity recording require checking in.\n\nPlease enter your Full Name and Official Work Email, then click 'Start Shift / Check In' to proceed.",
            parent=root,
        )

    root.protocol("WM_DELETE_WINDOW", on_prevent_close)
    root.bind("<Escape>", lambda e: on_prevent_close())
    name_entry.bind("<Return>", lambda e: email_entry.focus_set())
    email_entry.bind("<Return>", on_submit)

    # Big Prominent Submit Button
    btn = tk.Button(
        card,
        text="🚀 Start Shift / Check In",
        font=("Segoe UI", 12, "bold"),
        bg="#10b981",
        fg="#ffffff",
        activebackground="#059669",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        command=on_submit,
    )
    btn.pack(fill="x", ipady=9, pady=(8, 0))

    if not last_name:
        name_entry.focus_set()
    else:
        email_entry.focus_set()
        if last_email:
            email_entry.select_range(0, tk.END)

    root.mainloop()

    return result["email"] or "", result["name"] or ""


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
