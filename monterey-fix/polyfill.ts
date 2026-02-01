/**
 * Safari 15 Polyfill: AbortSignal.timeout
 * Safari 15 (macOS Monterey/iOS 15) 不支持 AbortSignal.timeout()
 * 这个 polyfill 必须在所有依赖加载前最先运行
 */
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
    (AbortSignal as any).timeout = (ms: number): AbortSignal => {
        const controller = new AbortController();
        setTimeout(() => {
            try {
                controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
            } catch (e) {
                // Fallback for environments where DOMException is tricky
                controller.abort();
            }
        }, ms);
        return controller.signal;
    };
}
