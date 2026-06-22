export type FallRiskLevel = 'low' | 'medium' | 'high';

/**
 * 动态加载评估题目。
 * 优先从后端接口获取，失败时回退到内置 FALL_RISK_SURVEY 常量。
 */
export async function loadFallRiskSurvey(): Promise<FallRiskSection[]> {
  let sections: FallRiskSection[] | null = null;
  try {
    const { fetchActiveSections } = await import('../services/fallRiskQuestions');
    sections = await fetchActiveSections();
  } catch {
    // 后端不可用或网络异常
  }
  if (sections && sections.length > 0) {
    return sections;
  }
  return FALL_RISK_SURVEY;
}

export type FallRiskQuestion = {
  id: string;
  text: string;
  /** 智能风险题绑定的产品标签，基础题为 undefined */
  productTag?: string;
};

export type FallRiskSection = {
  key: string;
  title: string;
  questions: FallRiskQuestion[];
};

/** 判断是否为智能风险题（绑定了产品标签） */
export function isSmartQuestion(q: FallRiskQuestion): boolean {
  return !!q.productTag;
}

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
      { id: 'body-9', text: '起身头晕、突发不适时，无法快速走到电话旁求助', productTag: '4G 一键报警对讲 SOS' },
      { id: 'body-10', text: '摔倒后无力自主起身，无法手动拨打电话求救', productTag: '雷达人体跌倒探测器' },
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
      { id: 'habit-7', text: '夜间卧床突发身体不适，异地子女无法实时知晓', productTag: '智能睡眠 / 离床监测雷达' },
      { id: 'habit-8', text: '长期独自居家，发生意外无专人第一时间核查处置', productTag: '全档位值守服务' },
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
      { id: 'living-room-7', text: '过道打滑绊倒，摔倒后长时间无人发现', productTag: '雷达人体跌倒探测器' },
      { id: 'living-room-8', text: '夜间过道无照明，起夜视线昏暗易失衡摔倒', productTag: '充电感应夜灯' },
      { id: 'living-room-9', text: '无远程告警同步渠道，意外发生子女无法实时接收通知', productTag: '全档位值守服务' },
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
      { id: 'bedroom-5', text: '夜间卧床摔倒、长时间久卧不动无人察觉', productTag: '智能睡眠 / 离床监测雷达' },
      { id: 'bedroom-6', text: '深夜下床无照明，黑暗环境易摔跤', productTag: '床边感应小夜灯' },
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
      { id: 'bathroom-6', text: '浴室湿滑摔倒，密闭空间呼救声音无法传出屋外', productTag: '浴室防水跌倒雷达 + 防水 SOS 按钮' },
      { id: 'bathroom-7', text: '洗浴突发头晕滑倒，无法走出浴室拨打求助电话', productTag: '壁挂防水一键呼叫器' },
      { id: 'bathroom-8', text: '长期站立洗澡，体力不支失衡摔倒无人知晓', productTag: '浴室跌倒雷达 + 平台值守联动告警' },
    ],
  },
  {
    key: 'facility',
    title: '6. 居家设施与习惯',
    questions: [
      { id: 'facility-1', text: '有门槛 / 台阶无警示' },
      { id: 'facility-2', text: '阳台窗台无防护' },
      { id: 'facility-3', text: '很少锻炼、平衡能力差' },
      { id: 'facility-4', text: '居家跌倒隐患多，无 7×24 小时实时监控兜底机制', productTag: '二级 / 三级人工值守套餐' },
      { id: 'facility-5', text: '无定期上门设备巡检、居家风险回访机制', productTag: '全档位值守服务' },
    ],
  },
];

export function countFallRiskQuestions(): number {
  return FALL_RISK_SURVEY.reduce((total, section) => total + section.questions.length, 0);
}

export function computeFallRiskLevel(score: number): FallRiskLevel {
  if (score <= 15) return 'low';
  if (score <= 30) return 'medium';
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