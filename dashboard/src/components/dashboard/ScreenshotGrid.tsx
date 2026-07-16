import { formatPing } from "@/hooks/useRealData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface Screenshot {
  id: string;
  url: string;
  window_title: string;
  timestamp: string;
}

export function ScreenshotGrid({ screenshots }: { screenshots: Screenshot[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {screenshots.map((s) => (
        <Dialog key={s.id}>
          <DialogTrigger asChild>
            <figure className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_20px_40px_-20px_rgba(15,23,42,0.25)]">
              <div className="relative overflow-hidden">
                <img
                  src={s.url}
                  alt={s.window_title}
                  loading="lazy"
                  className="h-40 w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                  {formatPing(s.timestamp)}
                </span>
              </div>
              <figcaption className="border-t border-slate-100 px-3 py-2">
                <p className="truncate text-xs font-medium text-slate-800">{s.window_title}</p>
              </figcaption>
            </figure>
          </DialogTrigger>
          <DialogContent className="max-w-4xl p-1 bg-slate-950 border-none rounded-xl overflow-hidden">
            <DialogHeader className="absolute top-0 w-full bg-black/60 p-4 backdrop-blur z-10 hidden group-hover:block">
              <DialogTitle className="text-white text-sm font-normal">{s.window_title} — {new Date(s.timestamp).toLocaleString()}</DialogTitle>
            </DialogHeader>
            <img
              src={s.url}
              alt={s.window_title}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
