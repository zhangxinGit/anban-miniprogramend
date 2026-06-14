import { USER_ROLES, type UserRole } from '../../shared/roles';

function roleToTag(role: UserRole): { text: string; tone: string } {
  switch (role) {
    case USER_ROLES.VISITOR:
      return { text: '游客', tone: 'neutral' };
    case USER_ROLES.LEAD:
      return { text: '待绑设备用户', tone: 'primary' };
    case USER_ROLES.CUSTOMER:
      return { text: '已成交用户', tone: 'primary' };
    case USER_ROLES.OPERATOR:
      return { text: '运营人员', tone: 'primary' };
    case USER_ROLES.ADMIN:
      return { text: '管理人员', tone: 'primary' };
    default:
      return { text: '未知', tone: 'neutral' };
  }
}

Component({
  properties: {
    role: { type: String, value: USER_ROLES.VISITOR },
    text: { type: String, value: '' }, // 可覆盖
  },
  data: {
    tone: 'neutral',
  },
  lifetimes: {
    attached() {
      this.sync();
    },
  },
  observers: {
    role() {
      this.sync();
    },
    text() {
      this.sync();
    },
  },
  methods: {
    sync() {
      const role = this.data.role as UserRole;
      const r = roleToTag(role);
      this.setData({ tone: r.tone });
      if (!this.data.text) this.setData({ text: r.text });
    },
  },
});
