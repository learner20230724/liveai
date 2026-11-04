// Keep a JPEG burst from consuming the microphone's upload budget.
export const AUDIO_QUEUE_LIMIT=64*1024;
export const VIDEO_QUEUE_LIMIT=8*1024;
export const VIDEO_FRAME_LIMIT=32*1024;
export const CONGESTION_TIMEOUT=10000;

export async function encodeLiveFrame(video,canvas,source){
  const context=canvas.getContext('2d');
  let edge=source==='screen'?960:480;
  while(edge>=160){
    const ratio=Math.min(1,edge/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
    context.drawImage(video,0,0,canvas.width,canvas.height);
    for(const quality of [.6,.44,.3]){
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(blob&&blob.size<=VIDEO_FRAME_LIMIT)return new Uint8Array(await blob.arrayBuffer());
    }
    edge=Math.floor(edge*.75);
  }
  return null;
}
