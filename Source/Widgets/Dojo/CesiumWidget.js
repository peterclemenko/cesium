/*global define,console*/
define([
        'require',
        'dojo/_base/declare',
        'dojo/ready',
        'dijit/_WidgetBase',
        'dijit/_TemplatedMixin',
        '../Viewer'
    ], function (
        require,
        declare,
        ready,
        _WidgetBase,
        _TemplatedMixin,
        Viewer) {
    "use strict";

    return declare('Cesium.CesiumWidget', [_WidgetBase, _TemplatedMixin], {
        templateString : '<div data-dojo-attach-point="parentNode" style="width: 100%; height: 100%;"></div>',

        postCreate : function() {
            ready(this, '_setupCesium');
        },

        _setupCesium : function() {
            Viewer.createOnWidget(this, this.parentNode);
        }
    });
});
