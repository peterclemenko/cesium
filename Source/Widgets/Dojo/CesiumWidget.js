/*global define,console*/
define([
        'dojo/_base/declare',
        'dijit/_WidgetBase',
        'dijit/_TemplatedMixin',
        '../Viewer'
    ], function (
        declare,
        _WidgetBase,
        _TemplatedMixin,
        Viewer) {
    "use strict";

    /**
     * This Dojo widget wraps the functionality of {@link Viewer}.
     *
     * @class CesiumWidget
     * @param {Object} options - A list of options to pre-configure the widget.  Names matching member fields/functions will override the default values.
     */
    return declare('Cesium.CesiumWidget', [_WidgetBase, _TemplatedMixin], {
        templateString : '<div data-dojo-attach-point="parentNode" style="width: 100%; height: 100%;"></div>',

        startup : function() {
            Viewer.createOnWidget(this, this.parentNode);
        }
    });
});
