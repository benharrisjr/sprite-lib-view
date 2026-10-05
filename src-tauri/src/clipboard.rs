use clipboard_rs::common::RustImage;
use clipboard_rs::{Clipboard, ClipboardContext, RustImageData};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::thread;

enum Job {
    Image(String),
    Files(Vec<String>),
    Text(String),
}

type Reply = Sender<Result<(), String>>;

/// Owns the clipboard context on a dedicated, long-lived thread. Keeping the
/// context alive is required on Linux (X11/Wayland), where clipboard contents
/// are served by the owning process and vanish when the context is dropped.
pub struct ClipboardWorker {
    tx: Mutex<Sender<(Job, Reply)>>,
}

impl ClipboardWorker {
    pub fn spawn() -> Self {
        let (tx, rx) = channel::<(Job, Reply)>();
        thread::spawn(move || {
            let ctx = ClipboardContext::new();
            for (job, reply) in rx {
                let result = match &ctx {
                    Ok(ctx) => run_job(ctx, job),
                    Err(e) => Err(format!("Clipboard unavailable: {e}")),
                };
                let _ = reply.send(result);
            }
        });
        Self { tx: Mutex::new(tx) }
    }

    fn run(&self, job: Job) -> Result<(), String> {
        let (reply_tx, reply_rx) = channel();
        self.tx
            .lock()
            .map_err(|e| e.to_string())?
            .send((job, reply_tx))
            .map_err(|e| e.to_string())?;
        reply_rx.recv().map_err(|e| e.to_string())?
    }
}

fn run_job(ctx: &ClipboardContext, job: Job) -> Result<(), String> {
    let err = |e: Box<dyn std::error::Error + Send + Sync>| e.to_string();
    match job {
        Job::Image(path) => {
            let img = RustImageData::from_path(&path).map_err(err)?;
            ctx.set_image(img).map_err(err)
        }
        Job::Files(paths) => ctx.set_files(paths).map_err(err),
        Job::Text(text) => ctx.set_text(text).map_err(err),
    }
}

/// Copies decoded image pixels (pasteable into editors/chat apps).
#[tauri::command]
pub async fn copy_image(
    worker: tauri::State<'_, ClipboardWorker>,
    path: String,
) -> Result<(), String> {
    worker.run(Job::Image(path))
}

/// Copies file references (pasteable into Finder/Explorer/file managers).
#[tauri::command]
pub async fn copy_files(
    worker: tauri::State<'_, ClipboardWorker>,
    paths: Vec<String>,
) -> Result<(), String> {
    worker.run(Job::Files(paths))
}

#[tauri::command]
pub async fn copy_text(worker: tauri::State<'_, ClipboardWorker>, text: String) -> Result<(), String> {
    worker.run(Job::Text(text))
}
