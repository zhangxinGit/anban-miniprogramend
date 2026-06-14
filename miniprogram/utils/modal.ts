type ModalTone = 'primary' | 'danger' | 'warning';

type AppModalOptions = WechatMiniprogram.ShowModalOption & {
  tone?: ModalTone;
};

const CONFIRM_COLORS: Record<ModalTone, string> = {
  primary: '#0E8946',
  danger: '#E53E3E',
  warning: '#FF7D00',
};

export function showAppModal(options: AppModalOptions) {
  const { tone = 'primary', confirmColor, cancelColor, ...rest } = options;
  return wx.showModal({
    cancelColor: cancelColor ?? '#666666',
    confirmColor: confirmColor ?? CONFIRM_COLORS[tone],
    ...rest,
  });
}