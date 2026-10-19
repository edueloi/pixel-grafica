import React, { useRef, useState } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { uiTheme } from './theme';

export interface UploadedFileItem {
  id: string;
  fileName: string;
  url?: string;
}

interface FileUploadProps {
  label?: string;
  hint?: string;
  files: UploadedFileItem[];
  onUpload: (file: File) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  accept?: string;
  className?: string;
}

export function FileUpload({
  label,
  hint,
  files,
  onUpload,
  onRemove,
  accept,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (uploading || !fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await onUpload(file);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemove(id);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <label className="ds-label">{label}</label>}

      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-label="Selecionar arquivos"
        aria-disabled={uploading}
        onKeyDown={e => { if (!uploading && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center cursor-pointer transition-colors",
          uiTheme.focus,
          dragOver ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-slate-50/70 hover:border-blue-300 hover:bg-blue-50/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          multiple
        />
        {uploading ? (
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 text-zinc-400" />
        )}
        <p className="text-xs font-medium text-zinc-600">
          {uploading ? 'Enviando...' : 'Clique ou arraste o arquivo aqui'}
        </p>
        {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
            >
              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="flex-1 truncate font-medium text-zinc-700">{f.fileName}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(f.id); }}
                disabled={removingId === f.id}
                aria-label={`Remover ${f.fileName}`}
                className={cn('text-zinc-400 hover:text-red-500 transition-colors shrink-0 rounded', uiTheme.focus)}
              >
                {removingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
