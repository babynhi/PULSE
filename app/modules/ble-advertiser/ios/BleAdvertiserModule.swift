import ExpoModulesCore
import CoreBluetooth

// Makes this iPhone announce one Bluetooth ID so other phones can find it.
// Works while the app is open (that's all we need for the demo).
public class BleAdvertiserModule: Module {
  private var manager: CBPeripheralManager?
  private var delegate: AdvertiserDelegate?

  public func definition() -> ModuleDefinition {
    Name("BleAdvertiser")

    // JS calls start("c0de0001-...") with this player's ID
    AsyncFunction("start") { (uuid: String, promise: Promise) in
      guard let parsed = UUID(uuidString: uuid) else {
        promise.reject("E_BAD_UUID", "Invalid UUID \(uuid)")
        return
      }
      self.manager?.stopAdvertising()
      let d = AdvertiserDelegate(uuid: CBUUID(nsuuid: parsed))
      self.delegate = d
      self.manager = CBPeripheralManager(delegate: d, queue: nil)
      promise.resolve(nil)
    }.runOnQueue(.main)

    Function("stop") {
      DispatchQueue.main.async {
        self.manager?.stopAdvertising()
        self.manager = nil
        self.delegate = nil
      }
    }
  }
}

// iOS tells us when Bluetooth is ready; only then can we start announcing.
final class AdvertiserDelegate: NSObject, CBPeripheralManagerDelegate {
  let uuid: CBUUID
  init(uuid: CBUUID) { self.uuid = uuid }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn {
      peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [uuid]])
    }
  }
}