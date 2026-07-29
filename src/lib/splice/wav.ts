/**
 * PCM WAV is a header plus raw samples — no compression, no dependency worth
 * pulling in for it. Same "small enough to just be correct" instinct as
 * Crest's ICO/ZIP encoders. 16-bit signed, interleaved channels, matching the
 * source buffer's own sample rate and channel count exactly.
 */
export function encodeWav(buffer: AudioBuffer): Uint8Array<ArrayBuffer> {
	const channels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const frameCount = buffer.length;
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const dataSize = frameCount * blockAlign;

	const out = new Uint8Array(44 + dataSize);
	const view = new DataView(out.buffer);

	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true); // byte rate
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true); // bits per sample
	writeString(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	const channelData: Float32Array[] = [];
	for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

	let offset = 44;
	for (let i = 0; i < frameCount; i++) {
		for (let c = 0; c < channels; c++) {
			const sample = Math.max(-1, Math.min(1, channelData[c][i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			offset += 2;
		}
	}

	return out;
}

function writeString(view: DataView, offset: number, text: string) {
	for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
