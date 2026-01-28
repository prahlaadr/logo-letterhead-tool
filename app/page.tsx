"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>("top-right");
  const [size, setSize] = useState(100);
  const [padding, setPadding] = useState(30);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState<string | null>(
    null
  );
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render PDF preview when PDF file changes
  useEffect(() => {
    if (!pdfFile) {
      setPdfPreviewUrl(null);
      setPdfDimensions(null);
      setPdfPreviewError(null);
      return;
    }

    const renderPdf = async () => {
      setPdfPreviewLoading(true);
      setPdfPreviewError(null);

      try {
        const pdfjs = await import("pdfjs-dist");

        // Set up worker from local public folder
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error("Canvas not available");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not get canvas context");
        }

        await page.render({ canvasContext: context, viewport, canvas }).promise;

        setPdfPreviewUrl(canvas.toDataURL());
        setPdfDimensions({ width: viewport.width, height: viewport.height });
      } catch (error) {
        console.error("PDF preview error:", error);
        setPdfPreviewError(
          error instanceof Error ? error.message : "Failed to render PDF preview"
        );
      } finally {
        setPdfPreviewLoading(false);
      }
    };

    renderPdf();
  }, [pdfFile]);

  const onPdfDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setPdfFile(acceptedFiles[0]);
    }
  }, []);

  const onLogoDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setLogoFile(acceptedFiles[0]);
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(acceptedFiles[0]);
    }
  }, []);

  const pdfDropzone = useDropzone({
    onDrop: onPdfDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  const logoDropzone = useDropzone({
    onDrop: onLogoDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".svg"] },
    multiple: false,
  });

  const processAndDownload = async () => {
    if (!pdfFile || !logoFile) return;

    setProcessing(true);
    try {
      let logoData: string;

      if (removeBackground) {
        setBgRemovalProgress("Loading background removal model...");
        const { removeBackground: removeBg } = await import(
          "@imgly/background-removal"
        );
        setBgRemovalProgress("Removing background...");
        const blob = await removeBg(logoFile, {
          progress: (key, current, total) => {
            if (key === "compute:inference") {
              setBgRemovalProgress(
                `Processing: ${Math.round((current / total) * 100)}%`
              );
            }
          },
        });
        const reader = new FileReader();
        logoData = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        setBgRemovalProgress(null);
      } else {
        const reader = new FileReader();
        logoData = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(logoFile);
        });
      }

      const pdfReader = new FileReader();
      const pdfData: string = await new Promise((resolve) => {
        pdfReader.onload = () => resolve(pdfReader.result as string);
        pdfReader.readAsDataURL(pdfFile);
      });

      const response = await fetch("/api/process-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfData,
          logoData,
          position,
          size,
          padding,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Processing failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `letterhead-${pdfFile.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Processing failed");
    } finally {
      setProcessing(false);
      setBgRemovalProgress(null);
    }
  };

  const positions: { value: Position; label: string }[] = [
    { value: "top-left", label: "Top Left" },
    { value: "top-right", label: "Top Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-right", label: "Bottom Right" },
  ];

  // Calculate logo position for preview (scaled to preview size)
  const getLogoStyle = () => {
    if (!pdfDimensions) return {};

    // Scale factor: preview renders at 1.5x, and we display it responsively
    const scaleFactor = 1.5;
    const scaledSize = size * scaleFactor;
    const scaledPadding = padding * scaleFactor;

    const style: React.CSSProperties = {
      position: "absolute",
      width: `${(scaledSize / pdfDimensions.width) * 100}%`,
      maxHeight: `${(scaledSize / pdfDimensions.height) * 100}%`,
      objectFit: "contain",
    };

    const paddingPercent = {
      x: `${(scaledPadding / pdfDimensions.width) * 100}%`,
      y: `${(scaledPadding / pdfDimensions.height) * 100}%`,
    };

    switch (position) {
      case "top-left":
        style.top = paddingPercent.y;
        style.left = paddingPercent.x;
        break;
      case "top-right":
        style.top = paddingPercent.y;
        style.right = paddingPercent.x;
        break;
      case "bottom-left":
        style.bottom = paddingPercent.y;
        style.left = paddingPercent.x;
        break;
      case "bottom-right":
        style.bottom = paddingPercent.y;
        style.right = paddingPercent.x;
        break;
    }

    return style;
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Logo Letterhead Tool
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Add your logo to PDF documents
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Preview */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="border border-zinc-300 dark:border-zinc-600 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800">
              {!pdfFile && (
                <div className="p-16 text-center text-zinc-500">
                  Upload a PDF to see preview
                </div>
              )}
              {pdfFile && pdfPreviewLoading && (
                <div className="p-16 text-center text-zinc-500">
                  Loading PDF preview...
                </div>
              )}
              {pdfFile && pdfPreviewError && (
                <div className="p-16 text-center text-red-500">
                  {pdfPreviewError}
                </div>
              )}
              {pdfPreviewUrl && (
                <div className="relative inline-block w-full">
                  <img
                    src={pdfPreviewUrl}
                    alt="PDF preview"
                    className="w-full h-auto"
                  />
                  {logoPreview && (
                    <img
                      src={logoPreview}
                      alt="Logo overlay"
                      style={getLogoStyle()}
                    />
                  )}
                </div>
              )}
            </div>
            {pdfFile && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                {logoPreview
                  ? "Showing first page. Logo will be added to all pages."
                  : "Upload a logo to see placement preview."}
              </p>
            )}
          </div>

          {/* Right Column - Configuration */}
          <div className="space-y-6">
            {/* Dropzones */}
            <div className="grid grid-cols-2 gap-4">
              {/* PDF Dropzone */}
              <div
                {...pdfDropzone.getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
                  pdfDropzone.isDragActive
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : pdfFile
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-400"
                }`}
              >
                <input {...pdfDropzone.getInputProps()} />
                <div className="text-center">
                  <div className="text-4xl mb-2">📄</div>
                  {pdfFile ? (
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium truncate">
                      {pdfFile.name}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Drop PDF here
                    </p>
                  )}
                </div>
              </div>

              {/* Logo Dropzone */}
              <div
                {...logoDropzone.getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
                  logoDropzone.isDragActive
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : logoFile
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                      : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-400"
                }`}
              >
                <input {...logoDropzone.getInputProps()} />
                <div className="text-center">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-12 mx-auto mb-2 object-contain"
                    />
                  ) : (
                    <div className="text-4xl mb-2">🖼️</div>
                  )}
                  {logoFile ? (
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium truncate">
                      {logoFile.name}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Drop logo here
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Logo Resolution Tips */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                Logo Resolution Tips
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                <li>
                  • <strong>Screen/web PDFs:</strong> 300px source image is
                  sufficient
                </li>
                <li>
                  • <strong>Print PDFs (300 DPI):</strong> Logo size in inches ×
                  300 = pixels needed
                </li>
                <li className="text-blue-600 dark:text-blue-400 text-xs">
                  Example: 2-inch printed logo needs 600px source image
                </li>
              </ul>
            </div>

            {/* Position Selector */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Logo Position
              </label>
              <div className="grid grid-cols-4 gap-2">
                {positions.map((pos) => (
                  <button
                    key={pos.value}
                    onClick={() => setPosition(pos.value)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      position === pos.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size Slider */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Logo Size: {size}px
              </label>
              <input
                type="range"
                min="50"
                max="300"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Padding Slider */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Padding: {padding}px
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={padding}
                onChange={(e) => setPadding(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Background Removal Toggle */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeBackground}
                  onChange={(e) => setRemoveBackground(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Remove logo background (takes 10-30s)
                </span>
              </label>
            </div>

            {/* Process Button */}
            <button
              onClick={processAndDownload}
              disabled={!pdfFile || !logoFile || processing}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                !pdfFile || !logoFile || processing
                  ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {processing
                ? bgRemovalProgress || "Processing..."
                : "Add Logo & Download PDF"}
            </button>
          </div>
        </div>

        {/* Offscreen canvas for PDF rendering */}
        <canvas
          ref={canvasRef}
          className="fixed -left-[9999px] top-0 pointer-events-none"
        />
      </div>
    </div>
  );
}
