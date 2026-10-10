import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareUrl } from '../src/ui/shareButton.js';

afterEach(() => vi.unstubAllGlobals());
const URL_ = 'https://example.com/?x=1';

describe('shareUrl 狀態', () => {
    it('有 Web Share API 且成功 → shared，不碰剪貼簿', async () => {
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { share: vi.fn().mockResolvedValue(), clipboard: { writeText } });
        expect(await shareUrl(URL_, 't')).toEqual({ status: 'shared', url: URL_ });
        expect(writeText).not.toHaveBeenCalled();
    });

    it('使用者關閉分享面板（AbortError）→ cancelled，不複製', async () => {
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), clipboard: { writeText } });
        expect((await shareUrl(URL_, 't')).status).toBe('cancelled');
        expect(writeText).not.toHaveBeenCalled();
    });

    it('分享面板失敗（非 AbortError）→ 退回複製連結', async () => {
        const writeText = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('NotAllowed')), clipboard: { writeText } });
        expect((await shareUrl(URL_, 't')).status).toBe('copied');
        expect(writeText).toHaveBeenCalledWith(URL_);
    });

    it('無 Web Share API → 複製連結', async () => {
        const writeText = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        expect(await shareUrl(URL_, 't')).toEqual({ status: 'copied', url: URL_ });
    });

    it('剪貼簿也失敗 → manual（由呼叫端顯示連結供手動複製）', async () => {
        vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
        expect(await shareUrl(URL_, 't')).toEqual({ status: 'manual', url: URL_ });
    });
});
