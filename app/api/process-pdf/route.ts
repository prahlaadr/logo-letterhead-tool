import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface PageConfig {
  pageNumber: number; // 1-indexed
  position: Position;
}

interface RequestBody {
  pdfData: string;
  logoData: string;
  size: number;
  padding: number;
  applyToAll: boolean;
  position: Position; // used when applyToAll=true
  pageConfigs?: PageConfig[]; // used when applyToAll=false
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const { pdfData, logoData, size, padding, applyToAll, position, pageConfigs } = body;

    // Decode base64 data
    const pdfBytes = Buffer.from(pdfData.split(",")[1], "base64");
    const logoBytes = Buffer.from(logoData.split(",")[1], "base64");

    // Process logo with sharp - convert to PNG and resize
    const processedLogo = await sharp(logoBytes)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    // Load PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pngImage = await pdfDoc.embedPng(processedLogo);

    // Get logo dimensions after embedding
    const logoDims = pngImage.scale(1);

    // Add logo to each page
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageNum = i + 1;

      // Determine position for this page
      let pagePosition: Position | null = null;
      if (applyToAll) {
        pagePosition = position;
      } else {
        const config = pageConfigs?.find((c) => c.pageNumber === pageNum);
        if (config) pagePosition = config.position;
      }

      // Skip this page if no position configured
      if (!pagePosition) continue;

      const { width, height } = page.getSize();

      // Calculate position
      let x: number;
      let y: number;

      switch (pagePosition) {
        case "top-left":
          x = padding;
          y = height - padding - logoDims.height;
          break;
        case "top-right":
          x = width - padding - logoDims.width;
          y = height - padding - logoDims.height;
          break;
        case "bottom-left":
          x = padding;
          y = padding;
          break;
        case "bottom-right":
          x = width - padding - logoDims.width;
          y = padding;
          break;
      }

      page.drawImage(pngImage, {
        x,
        y,
        width: logoDims.width,
        height: logoDims.height,
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(modifiedPdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=letterhead.pdf",
      },
    });
  } catch (error) {
    console.error("PDF processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}
