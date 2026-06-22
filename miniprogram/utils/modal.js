const CONFIRM_COLORS = {
    primary: '#0E8946',
    danger: '#E53E3E',
    warning: '#FF7D00',
};
export function showAppModal(options) {
    const { tone = 'primary', confirmColor, cancelColor, ...rest } = options;
    return wx.showModal({
        cancelColor: cancelColor !== null && cancelColor !== void 0 ? cancelColor : '#666666',
        confirmColor: confirmColor !== null && confirmColor !== void 0 ? confirmColor : CONFIRM_COLORS[tone],
        ...rest,
    });
}
