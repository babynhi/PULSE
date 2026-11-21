Pod::Spec.new do |s|
  s.name           = 'BleAdvertiser'
  s.version        = '0.1.0'
  s.summary        = 'Advertise a BLE service UUID'
  s.license        = 'MIT'
  s.author         = 'PULSE'
  s.homepage       = 'https://github.com/babynhi/PULSE'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'
  s.source_files = "**/*.{h,m,swift}"
end