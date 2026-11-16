import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isJpeg } from './directoryPhoto.js';

const jpeg = (size: number): Buffer => {
    const buffer = Buffer.alloc(size, 1);
    buffer.set([0xff, 0xd8, 0xff], 0);
    buffer.set([0xff, 0xd9], size - 2);
    return buffer;
};

describe('isJpeg', () => {
    it('acepta un JPEG con inicio y final válidos', () => {
        assert.equal(isJpeg(jpeg(2048)), true);
    });
    it('rechaza un PNG aunque se mande como JPEG', () => {
        const png = Buffer.alloc(2048, 1);
        png.set([0x89, 0x50, 0x4e, 0x47], 0);
        assert.equal(isJpeg(png), false);
    });
    it('rechaza un archivo cortado o demasiado pequeño', () => {
        assert.equal(isJpeg(jpeg(10)), false);
        const truncated = jpeg(2048);
        truncated[2047] = 0;
        assert.equal(isJpeg(truncated), false);
    });
});
