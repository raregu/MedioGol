import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OptimizeRequest {
  imageData: string;
  userId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { imageData, userId }: OptimizeRequest = await req.json();

    if (!imageData || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const canvas = new OffscreenCanvas(200, 200);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    const blob = new Blob([imageBuffer]);
    const imageBitmap = await createImageBitmap(blob);

    const aspectRatio = imageBitmap.width / imageBitmap.height;
    let drawWidth = 200;
    let drawHeight = 200;
    let offsetX = 0;
    let offsetY = 0;

    if (aspectRatio > 1) {
      drawWidth = 200 * aspectRatio;
      offsetX = -(drawWidth - 200) / 2;
    } else {
      drawHeight = 200 / aspectRatio;
      offsetY = -(drawHeight - 200) / 2;
    }

    ctx.drawImage(imageBitmap, offsetX, offsetY, drawWidth, drawHeight);

    const optimizedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.85,
    });

    const arrayBuffer = await optimizedBlob.arrayBuffer();
    const optimizedBase64 = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    return new Response(
      JSON.stringify({
        success: true,
        optimizedImage: `data:image/jpeg;base64,${optimizedBase64}`,
        originalSize: imageBuffer.length,
        optimizedSize: arrayBuffer.byteLength,
        compressionRatio: ((1 - arrayBuffer.byteLength / imageBuffer.length) * 100).toFixed(2),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error optimizing image:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
