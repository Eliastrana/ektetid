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
      /*
       * Observe only. Nothing here configures or activates the session.
       *
       * It used to set an ambient category and activate the session, which
       * froze video playback: expo-video owns the session while a clip is
       * playing, and reconfiguring it underneath stalls the player. Worse, the
       * matching deactivation on teardown tore the session out from under
       * whatever was still using it. outputVolume is readable and observable
       * without any of that — the property reflects the hardware, not our
       * session.
       */
      self.observation = AVAudioSession.sharedInstance()
        .observe(\.outputVolume, options: [.new]) { [weak self] _, change in
          guard let volume = change.newValue else { return }
          self?.sendEvent("onVolumeChange", ["volume": Double(volume)])
        }
    }

    OnStopObserving {
      self.observation?.invalidate()
      self.observation = nil
    }
  }
}
