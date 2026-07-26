import AVFoundation
import ExpoModulesCore

/**
 Reports changes to the system output volume.

 There is no API for "the user pressed a volume button" — the buttons are owned
 by the system. What is observable is the volume they change, so this watches
 `AVAudioSession.outputVolume` and reports every change. That is enough to tell
 that someone reached for the volume, which is all the app needs to know.

 The observation only runs while something is listening: an audio session left
 active in the background interferes with other apps' playback.
 */
public class VolumeButtonsModule: Module {
  private var observation: NSKeyValueObservation?

  public func definition() -> ModuleDefinition {
    Name("VolumeButtons")

    Events("onVolumeChange")

    OnStartObserving {
      let session = AVAudioSession.sharedInstance()

      // ambient, so this never interrupts music the user already has playing —
      // reading the volume must not be the reason someone's podcast stops.
      try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
      try? session.setActive(true)

      self.observation = session.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
        guard let volume = change.newValue else { return }
        self?.sendEvent("onVolumeChange", ["volume": Double(volume)])
      }
    }

    OnStopObserving {
      self.observation?.invalidate()
      self.observation = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
  }
}
