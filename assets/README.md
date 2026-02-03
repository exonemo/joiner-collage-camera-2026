# Assets Folder

## Shutter Sound

Place your shutter sound file as `shutter.wav` in this directory.

### Requirements for Optimal Performance

- **File name**: `shutter.wav`
- **Format**: WAV (uncompressed) for best performance
- **Alternative formats**: MP3, OGG (with slight performance impact)
- **Duration**: 0.05-0.2 seconds (shorter = better performance)
- **Sample rate**: 44.1 kHz or 48 kHz
- **Bit depth**: 16-bit (sufficient quality, smaller file)
- **Channels**: Mono (stereo not needed for UI sounds)
- **File size**: Keep under 50KB for instant loading

### Performance Optimizations

The app uses Web Audio API for high-performance audio:
- Audio buffer is preloaded for instant playback
- Multiple concurrent sounds supported without blocking
- Non-blocking audio playback in separate thread
- Automatic fallback to HTML Audio if Web Audio fails

### Usage

The shutter sound will automatically play when:
- User taps/clicks to capture a video region
- Multiple rapid taps will layer sounds naturally

### Controls

```javascript
// Enable/disable shutter sound
app.enableShutterSound(true);  // or false

// Set volume (0.0 to 1.0)
app.setShutterVolume(0.5);

// Configure concurrent sounds (1-5)
app.setMaxConcurrentSounds(3);

// Toggle Web Audio mode
app.setWebAudioMode(true);

// Check audio performance
const info = app.getAudioPerformanceInfo();
```

### File Format Recommendations

1. **Best**: WAV (16-bit, 44.1kHz, Mono, <50KB)
2. **Good**: MP3 (128kbps, <30KB)
3. **Avoid**: Large files, long duration, high bit rates
