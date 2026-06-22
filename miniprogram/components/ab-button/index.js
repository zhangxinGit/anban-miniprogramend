"use strict";
Component({
    properties: {
        variant: { type: String, value: 'primary' }, // primary | secondary | danger
        plain: { type: Boolean, value: false },
        block: { type: Boolean, value: true },
        size: { type: String, value: 'md' }, // md | sm
        disabled: { type: Boolean, value: false },
    },
    methods: {
        onTap(e) {
            if (this.data.disabled)
                return;
            this.triggerEvent('tap', e);
        },
    },
});
