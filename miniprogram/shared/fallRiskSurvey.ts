export type FallRiskLevel = 'low' | 'medium' | 'high';

export type FallRiskQuestion = {
  id: string;
  text: string;
};

export type FallRiskSection = {
  key: string;
  title: string;
  questions: FallRiskQuestion[];
};

export const FALL_RISK_SURVEY: FallRiskSection[] = [
  {
    key: 'body',
    title: '1. 个人身体状况',
    questions: [
      { id: 'body-1', text: '年龄 75 周岁及以上' },
      { id: 'body-2', text: '近 1 年内有跌倒史' },
      { id: 'body-3', text: '走路不稳、步态摇晃' },
      { id: 'body-4', text: '起身、转身动作迟缓费力' },
      { id: 'body-5', text: '头晕、低血压、起身发黑' },
      { id: 'body-6', text: '视力模糊、看不清路' },
      { id: 'body-7', text: '听力下降、反应迟钝' },
      { id: 'body-8', text: '腰腿疼痛、腿脚无力' },
    ],
  },
  {
    key: 'habit',
    title: '2. 日常行为与用药',
    questions: [
      { id: 'habit-1', text: '经常独自居家' },
      { id: 'habit-2', text: '夜间频繁起夜' },
      { id: 'habit-3', text: '在家穿拖鞋走动' },
      { id: 'habit-4', text: '经常弯腰够取物品' },
      { id: 'habit-5', text: '服用降压 / 安眠 / 镇静药' },
      { id: 'habit-6', text: '起身太快、不缓慢起身' },
    ],
  },
  {
    key: 'living-room',
    title: '3. 客厅 / 过道环境',
    questions: [
      { id: 'living-room-1', text: '地面光滑无防滑' },
      { id: 'living-room-2', text: '地面有杂物、电线凌乱' },
      { id: 'living-room-3', text: '过道狭窄易磕碰' },
      { id: 'living-room-4', text: '无夜间感应小夜灯' },
      { id: 'living-room-5', text: '座椅过低、起身费劲' },
      { id: 'living-room-6', text: '家中无扶手、无借力点' },
    ],
  },
  {
    key: 'bedroom',
    title: '4. 卧室环境',
    questions: [
      { id: 'bedroom-1', text: '床高度不合适' },
      { id: 'bedroom-2', text: '床边无扶手借力' },
      { id: 'bedroom-3', text: '卧室照明不足、昏暗' },
      { id: 'bedroom-4', text: '地毯边角翘起易绊倒' },
    ],
  },
  {
    key: 'bathroom',
    title: '5. 卫生间 / 浴室环境',
    questions: [
      { id: 'bathroom-1', text: '卫生间地面潮湿易滑' },
      { id: 'bathroom-2', text: '洗澡无防滑垫 / 防滑鞋' },
      { id: 'bathroom-3', text: '未安装安全扶手' },
      { id: 'bathroom-4', text: '坐便器不适、起身困难' },
      { id: 'bathroom-5', text: '无洗澡椅、只能站立洗' },
    ],
  },
  {
    key: 'facility',
    title: '6. 居家设施与习惯',
    questions: [
      { id: 'facility-1', text: '有门槛 / 台阶无警示' },
      { id: 'facility-2', text: '阳台窗台无防护' },
      { id: 'facility-3', text: '很少锻炼、平衡能力差' },
    ],
  },
];

export function countFallRiskQuestions(): number {
  return FALL_RISK_SURVEY.reduce((total, section) => total + section.questions.length, 0);
}

export function computeFallRiskLevel(score: number): FallRiskLevel {
  if (score <= 12) return 'low';
  if (score <= 23) return 'medium';
  return 'high';
}

export function fallRiskLevelMeta(level: FallRiskLevel): {
  label: string;
  tone: string;
  description: string;
} {
  switch (level) {
    case 'high':
      return {
        label: '高风险',
        tone: 'high',
        description: '已出现较多跌倒诱因，建议尽快完成环境整改并安排专业复评。',
      };
    case 'medium':
      return {
        label: '中风险',
        tone: 'medium',
        description: '存在多项潜在跌倒隐患，建议分场景逐项整改并持续跟踪。',
      };
    default:
      return {
        label: '低风险',
        tone: 'low',
        description: '当前整体风险可控，建议保持良好习惯并定期复评。',
      };
  }
}