import AVFoundation
import AppKit

@main struct ExportDemo {
 static func main() async throws {
  let args=CommandLine.arguments
  let input=URL(fileURLWithPath:args[1]),output=URL(fileURLWithPath:args[2])
  let asset=AVURLAsset(url:input)
  let duration=try await asset.load(.duration)
  guard let export=AVAssetExportSession(asset:asset,presetName:AVAssetExportPresetHighestQuality)else{fatalError("No video exporter")}
  export.shouldOptimizeForNetworkUse=true
  try await export.export(to:output,as:.mp4)
  let tracks=try await asset.loadTracks(withMediaType:.video)
  let size=try await tracks[0].load(.naturalSize)
  print("Exported \(CMTimeGetSeconds(duration)) seconds; \(size.width) × \(size.height)")
  if args.count>3 {
   let image=AVAssetImageGenerator(asset:asset)
   image.appliesPreferredTrackTransform=true
   let frame=try await image.image(at:CMTime(seconds:3,preferredTimescale:600)).image
   let bitmap=NSBitmapImageRep(cgImage:frame)
   try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:args[3]))
  }
 }
}
