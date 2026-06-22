/**
 * PageGuard — 页面生命周期守卫
 *
 * 解决切 Tab 后旧页面的异步回调继续执行 setData 导致渲染争抢、卡顿黑屏问题。
 *
 * 用法：
 *  1. 在 Page 实例上声明 _pageDead: boolean
 *  2. onHide / onUnload 调用 markPageDead(this)
 *  3. onShow 调用 markPageAlive(this)
 *  4. 所有 async 回调中 await 后调用 safeSetData(this, data) 代替 this.setData(data)
 *  5. wx.nextTick 回调中用 guardNextTick(this, callback) 代替
 */
/** 标记页面已不可见，后续所有 setData 将被自动拦截 */
export function markPageDead(page) {
    page._pageDead = true;
}
/** 标记页面已恢复可见，恢复 setData 能力 */
export function markPageAlive(page) {
    page._pageDead = false;
}
/** 安全的 setData：页面隐藏/销毁后自动跳过 */
export function safeSetData(page, data) {
    if (page._pageDead)
        return;
    page.setData(data);
}
/** 安全的 wx.nextTick：页面隐藏/销毁后的回调不执行 */
export function guardNextTick(page, callback) {
    wx.nextTick(() => {
        if (page._pageDead)
            return;
        callback();
    });
}
/** 批量解除 wx.nextTick 的 pending 回调（通过 pageDead 标志） */
export function flushNextTickGuard(page) {
    // 标记 pageDead 后，后续 nextTick 回调自动跳过。
    // 已入队但尚未执行的 nextTick 无法主动取消（微信 API 限制），
    // 但 guardNextTick 通过回调内检查 pageDead 来安全跳过。
    markPageDead(page);
}
