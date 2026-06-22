export function fmtTime(ts) {
    const d = new Date(ts);
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}
export const SAFETY_QUESTIONS = [
    {
        id: 'q1',
        title: '家中地面是否经常湿滑或有杂物堆放？',
        options: [
            { label: '地面干燥、通道通畅', value: 0 },
            { label: '经常湿滑或有杂物堆放', value: 1 },
        ],
    },
    {
        id: 'q2',
        title: '夜间起夜或经过走道时，家中照明是否不足？',
        options: [
            { label: '灯光充足，无暗角', value: 0 },
            { label: '夜间无光，需要手电', value: 1 },
        ],
    },
    {
        id: 'q3',
        title: '老人起身、如厕或洗澡时，是否缺少扶手或支撑？',
        options: [
            { label: '均有扶手借力', value: 0 },
            { label: '无任何借力设施', value: 1 },
        ],
    },
    {
        id: 'q4',
        title: '厨房燃气、热水器或插座线路是否存在老化隐患？',
        options: [
            { label: '管线、电器定期检修', value: 0 },
            { label: '线路有裸露、开线情况', value: 1 },
        ],
    },
    {
        id: 'q5',
        title: '家中门槛、台阶、阳台窗边是否存在绊倒或坠落风险？',
        options: [
            { label: '无高差，护栏完好', value: 0 },
            { label: '有绊倒或坠落风险', value: 1 },
        ],
    },
    {
        id: 'q6',
        title: '老人行动是否迟缓，近期是否有跌倒或磕碰经历？',
        options: [
            { label: '行动自如，无跌倒史', value: 0 },
            { label: '行动迟缓，有过跌倒', value: 1 },
        ],
    },
    {
        id: 'q7',
        title: '家里是否缺少一键呼叫、紧急联系人或求助方式？',
        options: [
            { label: '配有一键报警器', value: 0 },
            { label: '独居无紧急联络方式', value: 1 },
        ],
    },
    {
        id: 'q8',
        title: '子女或家人是否难以及时关注老人居家安全？',
        options: [
            { label: '和子女同住，常照看', value: 0 },
            { label: '独居，子女不经常在身边', value: 1 },
        ],
    },
];
export function riskMeta(level) {
    switch (level) {
        case 'LOW':
            return {
                color: '#0E8946',
                icon: '✓',
                text: '低风险',
                suggestions: [
                    '当前居家环境整体较安全，建议继续保持通道通畅、地面干燥。',
                    '可定期检查照明、插座和防滑设施，维持日常风险可控。',
                ],
            };
        case 'MEDIUM':
            return {
                color: '#FFB020',
                icon: '!',
                text: '中风险',
                suggestions: [
                    '家中已有一定风险点，建议优先排查照明、防滑与扶手等基础防护。',
                    '如老人近期开启独居或行动不便，可预约专业评估进一步排查。',
                ],
            };
        default:
            return {
                color: '#FF4D4F',
                icon: '▲',
                text: '高风险',
                suggestions: [
                    '建议尽快预约上门专业评估，优先补齐防滑、扶手和应急求助能力。',
                    '如近期已发生跌倒、磕碰或行动明显不便，建议尽快安排家属陪同处理。',
                ],
            };
    }
}
