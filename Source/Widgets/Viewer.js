/*global define,console*/
define([
    '../Core/DeveloperError',
    '../Core/BoundingRectangle',
    '../Core/Ellipsoid',
    '../Core/computeSunPosition',
    '../Core/EventHandler',
    '../Core/FeatureDetection',
    '../Core/MouseEventType',
    '../Core/Cartesian2',
    '../Core/Cartesian3',
    '../Core/JulianDate',
    '../Core/DefaultProxy',
    '../Core/requestAnimationFrame',
    '../Scene/Scene',
    '../Scene/CentralBody',
    '../Scene/BingMapsTileProvider',
    '../Scene/BingMapsStyle',
    '../Scene/SingleTileProvider',
    '../Scene/PerformanceDisplay'
], function(
    DeveloperError,
    BoundingRectangle,
    Ellipsoid,
    computeSunPosition,
    EventHandler,
    FeatureDetection,
    MouseEventType,
    Cartesian2,
    Cartesian3,
    JulianDate,
    DefaultProxy,
    requestAnimationFrame,
    Scene,
    CentralBody,
    BingMapsTileProvider,
    BingMapsStyle,
    SingleTileProvider,
    PerformanceDisplay
) {
    "use strict";

    /**
     * This viewer constructs a Cesium scene with the Earth.
     * @alias Viewer
     * @constructor
     * @param {DOM Node} parentNode - The parent HTML element for the widget will typically be a <code>div</code> explicitly specifying placement on the page.
     * @param {Object} options - A list of options to pre-configure the widget.  Names matching member fields/functions will override the default values.
     */
    var Viewer = function(parentNode, options) {
        this.parentNode = parentNode;
        this._sunPosition = new Cartesian3();

        // Copy all options to this.
        if (typeof options === 'object') {
            for (var opt in options) {
                if (options.hasOwnProperty(opt)) {
                    this[opt] = options[opt];
                }
            }
        }

        this._createNodes(parentNode);
        this._setupCesium();
    };

    // Static constructor for other frameworks like Dojo.
    Viewer.createOnWidget = function(externalWidget, parentNode) {
        externalWidget.parentNode = parentNode;
        externalWidget._sunPosition = new Cartesian3();

        for (var opt in Viewer.prototype) {
            if (Viewer.prototype.hasOwnProperty(opt) && !externalWidget.hasOwnProperty(opt)) {
                externalWidget[opt] = Viewer.prototype[opt];
            }
        }

        externalWidget._createNodes(parentNode);
        externalWidget._setupCesium();
    };

    Viewer.prototype._createNodes = function(parentNode) {
        this.containerNode = document.createElement('div');
        this.containerNode.style.cssText = 'width: 100%; height: 100%;';

        this.cesiumLogo = document.createElement('a');
        this.cesiumLogo.href = 'http://cesium.agi.com/';
        this.cesiumLogo.target = '_blank';
        this.cesiumLogo.style.cssText = 'display: block; position: absolute; bottom: 4px; left: 0; text-decoration: none; ' +
            'background-image: url(' + this.imageBase + 'Cesium_Logo_overlay.png); width: 118px; height: 26px;';

        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'width: 100%; height: 100%;';

        this.containerNode.appendChild(this.cesiumLogo);
        this.containerNode.appendChild(this.canvas);
        parentNode.appendChild(this.containerNode);
    };

    /**
     * Path to included images, so widget can find things like night textures and specular maps.
     *
     * @type {String}
     * @memberof Viewer.prototype
     * @default '../../../Images/'
     */
    Viewer.prototype.imageBase = '../../../Images/';

    /**
     * Enable streaming Imagery.  This is read-only after construction.
     *
     * @type {Boolean}
     * @memberof Viewer.prototype
     * @default true
     * @see Viewert#enableStreamingImagery
     */
    Viewer.prototype.useStreamingImagery = true;

    /**
     * The map style for streaming imagery.  This is read-only after construction.
     *
     * @type {BingMapsStyle}
     * @memberof Viewer.prototype
     * @default {@link BingMapsStyle.AERIAL}
     * @see Viewer#setStreamingImageryMapStyle
     */
    Viewer.prototype.mapStyle = BingMapsStyle.AERIAL;

    /**
     * Register this widget's resize handler to get called every time the browser window
     * resize event fires.  This is read-only after construction.  Generally this should
     * be true for full-screen widgets, and true for
     * fluid layouts where the widget is likely to change size at the same time as the
     * window.  The exception is, if you use a Dojo layout where this widget exists inside
     * a Dojo ContentPane or similar, you should set this to false, because Dojo will perform
     * its own layout calculations and call this widget's resize handler automatically.
     * This can also be false for a fixed-size widget.
     *
     * If unsure, test the widget with this set to false, and if window resizes cause the
     * globe to stretch, change this to true.
     *
     * @type {Boolean}
     * @memberof Viewer.prototype
     * @default true
     * @see Viewer#resize
     */
    Viewer.prototype.resizeWidgetOnWindowResize = true;

    /**
     * This function will get a callback in the event of setup failure, likely indicating
     * a problem with WebGL support or the availability of a GL context.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Object} widget - A reference to this widget
     * @param {Object} error - The exception that was thrown during setup
     */
    Viewer.prototype.onSetupError = function(widget, error) {
        console.error(error);
    };

    /**
     * This function must be called when the widget changes size.  It updates the canvas
     * size, camera aspect ratio, and viewport size.
     *
     * @function
     * @memberof Viewer.prototype
     * @see Viewer#resizeWidgetOnWindowResize
     */
    Viewer.prototype.resize = function() {
        var width = this.canvas.clientWidth, height = this.canvas.clientHeight;

        if (typeof this.scene === 'undefined' || (this.canvas.width === width && this.canvas.height === height)) {
            return;
        }

        this.canvas.width = width;
        this.canvas.height = height;
        this.scene.getCamera().frustum.aspectRatio = width / height;
    };

    Viewer.prototype._handleLeftClick = function(e) {
        if (typeof this.onObjectSelected !== 'undefined') {
            // If the user left-clicks, we re-send the selection event, regardless if it's a duplicate,
            // because the client may want to react to re-selection in some way.
            this.selectedObject = this.scene.pick(e.position);
            this.onObjectSelected(this.selectedObject);
        }
    };

    Viewer.prototype._handleRightClick = function(e) {
        if (typeof this.onObjectRightClickSelected !== 'undefined') {
            // If the user right-clicks, we re-send the selection event, regardless if it's a duplicate,
            // because the client may want to react to re-selection in some way.
            this.selectedObject = this.scene.pick(e.position);
            this.onObjectRightClickSelected(this.selectedObject);
        }
    };

    Viewer.prototype._handleMouseMove = function(movement) {
        if (typeof this.onObjectMousedOver !== 'undefined') {
            // Don't fire multiple times for the same object as the mouse travels around the screen.
            var mousedOverObject = this.scene.pick(movement.endPosition);
            if (this.mousedOverObject !== mousedOverObject) {
                this.mousedOverObject = mousedOverObject;
                this.onObjectMousedOver(mousedOverObject);
            }
        }
        if (typeof this.leftDown !== 'undefined' && this.leftDown && typeof this.onLeftDrag !== 'undefined') {
            this.onLeftDrag(movement);
        } else if (typeof this.rightDown !== 'undefined' && this.rightDown && typeof this.onZoom !== 'undefined') {
            this.onZoom(movement);
        }
    };

    Viewer.prototype._handleRightDown = function(e) {
        this.rightDown = true;
        if (typeof this.onRightMouseDown !== 'undefined') {
            this.onRightMouseDown(e);
        }
    };

    Viewer.prototype._handleRightUp = function(e) {
        this.rightDown = false;
        if (typeof this.onRightMouseUp !== 'undefined') {
            this.onRightMouseUp(e);
        }
    };

    Viewer.prototype._handleLeftDown = function(e) {
        this.leftDown = true;
        if (typeof this.onLeftMouseDown !== 'undefined') {
            this.onLeftMouseDown(e);
        }
    };

    Viewer.prototype._handleLeftUp = function(e) {
        this.leftDown = false;
        if (typeof this.onLeftMouseUp !== 'undefined') {
            this.onLeftMouseUp(e);
        }
    };

    Viewer.prototype._handleWheel = function(e) {
        if (typeof this.onZoom !== 'undefined') {
            this.onZoom(e);
        }
    };

    Viewer.prototype._setupCesium = function() {
        this.ellipsoid = Ellipsoid.WGS84;

        var canvas = this.canvas, ellipsoid = this.ellipsoid, scene, widget = this;

        try {
            scene = this.scene = new Scene(canvas);
        } catch (ex) {
            if (typeof this.onSetupError !== 'undefined') {
                this.onSetupError(this, ex);
            }
            return;
        }

        this.resize();

        canvas.oncontextmenu = function() {
            return false;
        };

        var maxTextureSize = scene.getContext().getMaximumTextureSize();
        if (maxTextureSize < 4095) {
            // Mobile, or low-end card
            this.dayImageUrl = this.dayImageUrl || this.imageBase + 'NE2_50M_SR_W_2048.jpg';
            this.nightImageUrl = this.nightImageUrl || this.imageBase + 'land_ocean_ice_lights_512.jpg';
        } else {
            // Desktop
            this.dayImageUrl = this.dayImageUrl || this.imageBase + 'NE2_50M_SR_W_4096.jpg';
            this.nightImageUrl = this.nightImageUrl || this.imageBase + 'land_ocean_ice_lights_2048.jpg';
            this.specularMapUrl = this.specularMapUrl || this.imageBase + 'earthspec1k.jpg';
            this.cloudsMapUrl = this.cloudsMapUrl || this.imageBase + 'earthcloudmaptrans.jpg';
            this.bumpMapUrl = this.bumpMapUrl || this.imageBase + 'earthbump1k.jpg';
        }

        var centralBody = this.centralBody = new CentralBody(ellipsoid);
        centralBody.showSkyAtmosphere = true;
        centralBody.showGroundAtmosphere = true;
        centralBody.logoOffset = new Cartesian2(125, 0);

        this._configureCentralBodyImagery();

        scene.getPrimitives().setCentralBody(centralBody);

        var camera = scene.getCamera();
        camera.position = camera.position.multiplyByScalar(1.5);

        this.centralBodyCameraController = camera.getControllers().addCentralBody();

        var handler = new EventHandler(canvas);
        handler.setMouseAction(function(e) { widget._handleLeftClick(e); }, MouseEventType.LEFT_CLICK);
        handler.setMouseAction(function(e) { widget._handleRightClick(e); }, MouseEventType.RIGHT_CLICK);
        handler.setMouseAction(function(e) { widget._handleMouseMove(e); }, MouseEventType.MOVE);
        handler.setMouseAction(function(e) { widget._handleLeftDown(e); }, MouseEventType.LEFT_DOWN);
        handler.setMouseAction(function(e) { widget._handleLeftUp(e); }, MouseEventType.LEFT_UP);
        handler.setMouseAction(function(e) { widget._handleWheel(e); }, MouseEventType.WHEEL);
        handler.setMouseAction(function(e) { widget._handleRightDown(e); }, MouseEventType.RIGHT_DOWN);
        handler.setMouseAction(function(e) { widget._handleRightUp(e); }, MouseEventType.RIGHT_UP);

        if (widget.resizeWidgetOnWindowResize) {
            window.addEventListener('resize', function() {
                widget.resize();
            }, false);
        }

        if (typeof this.postSetup !== 'undefined') {
            this.postSetup(this);
        }

        this.defaultCamera = camera.clone();
    },

    /**
     * Reset the camera to the home view for the current scene mode.
     * @function
     * @memberof Viewer.prototype
     */
    Viewer.prototype.viewHome = function() {
        var camera = this.scene.getCamera();
        camera.position = this.defaultCamera.position;
        camera.direction = this.defaultCamera.direction;
        camera.up = this.defaultCamera.up;
        camera.transform = this.defaultCamera.transform;
        camera.frustum = this.defaultCamera.frustum.clone();

        var controllers = camera.getControllers();
        controllers.removeAll();
        this.centralBodyCameraController = controllers.addCentralBody();
    };

    /**
     * Test if the clouds are configured and available for display.
     *
     * @function
     * @memberof Viewer.prototype
     * @returns {Boolean} <code>true</code> if the <code>cloudsMapSource</code> is defined.
     */
    Viewer.prototype.areCloudsAvailable = function() {
        return typeof this.centralBody.cloudsMapSource !== 'undefined';
    };

    /**
     * Enable or disable the display of clouds.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Boolean} useClouds - <code>true</code> to enable clouds, if configured.
     */
    Viewer.prototype.enableClouds = function(useClouds) {
        if (this.areCloudsAvailable()) {
            this.centralBody.showClouds = useClouds;
            this.centralBody.showCloudShadows = useClouds;
        }
    };

    /**
     * Enable or disable the FPS (Frames Per Second) perfomance display.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Boolean} showStatistics - <code>true</code> to enable it.
     */
    Viewer.prototype.enableStatistics = function(showStatistics) {
        if (typeof this._performanceDisplay === 'undefined' && showStatistics) {
            this._performanceDisplay = new PerformanceDisplay();
            this.scene.getPrimitives().add(this._performanceDisplay);
        } else if (typeof this._performanceDisplay !== 'undefined' && !showStatistics) {
            this.scene.getPrimitives().remove(this._performanceDisplay);
            this._performanceDisplay = undefined;
        }
    };

    /**
     * Enable or disable the "sky atmosphere" effect, which displays the limb
     * of the Earth (seen from space) or blue sky (seen from inside the atmosphere).
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Boolean} show - <code>true</code> to enable the effect.
     */
    Viewer.prototype.showSkyAtmosphere = function(show) {
        this.centralBody.showSkyAtmosphere = show;
    };

    /**
     * Enable or disable the "ground atmosphere" effect, which makes the surface of
     * the globe look pale at a distance.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Boolean} show - <code>true</code> to enable the effect.
     */
    Viewer.prototype.showGroundAtmosphere = function(show) {
        this.centralBody.showGroundAtmosphere = show;
    };

    /**
     * Enable or disable streaming imagery, and update the globe.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Boolean} value - <code>true</code> to enable streaming imagery.
     * @see Viewer#useStreamingImagery
     */
    Viewer.prototype.enableStreamingImagery = function(value) {
        this.useStreamingImagery = value;
        this._configureCentralBodyImagery();
    };

    /**
     * Change the streaming imagery type, and update the globe.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {BingMapsStyle} value - the new map style to use.
     * @see Viewer#mapStyle
     */
    Viewer.prototype.setStreamingImageryMapStyle = function(value) {
        this.useStreamingImagery = true;

        if (this.mapStyle !== value) {
            this.mapStyle = value;
            this._configureCentralBodyImagery();
        }
    };

    /**
     * Set the positional offset of the logo of the streaming imagery provider.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {Integer} logoOffsetX - The horizontal offset in screen space
     * @param {Integer} logoOffsetY - The vertical offset in screen space
     */
    Viewer.prototype.setLogoOffset = function(logoOffsetX, logoOffsetY) {
        var logoOffset = this.centralBody.logoOffset;
        if ((logoOffsetX !== logoOffset.x) || (logoOffsetY !== logoOffset.y)) {
            this.centralBody.logoOffset = new Cartesian2(logoOffsetX, logoOffsetY);
        }
    };

    /**
     * Call this function prior to rendering each animation frame, to prepare
     * all CZML objects and other settings for the next frame.
     *
     * @function
     * @memberof Viewer.prototype
     * @param {JulianDate} currentTime - The date and time in the scene of the frame to be rendered
     */
    Viewer.prototype.update = function(currentTime) {
        this.scene.setSunPosition(computeSunPosition(currentTime, this._sunPosition));
    };

    /**
     * Render the widget's scene.
     * @function
     * @memberof Viewer.prototype
     */
    Viewer.prototype.render = function() {
        this.scene.render();
    };

    Viewer.prototype._configureCentralBodyImagery = function() {
        var centralBody = this.centralBody;

        if (this.useStreamingImagery) {
            centralBody.dayTileProvider = new BingMapsTileProvider({
                server : 'dev.virtualearth.net',
                mapStyle : this.mapStyle,
                // Some versions of Safari support WebGL, but don't correctly implement
                // cross-origin image loading, so we need to load Bing imagery using a proxy.
                proxy : FeatureDetection.supportsCrossOriginImagery() ? undefined : new DefaultProxy('/proxy/')
            });
        } else {
            centralBody.dayTileProvider = new SingleTileProvider(this.dayImageUrl);
        }

        centralBody.nightImageSource = this.nightImageUrl;
        centralBody.specularMapSource = this.specularMapUrl;
        centralBody.cloudsMapSource = this.cloudsMapUrl;
        centralBody.bumpMapSource = this.bumpMapUrl;
    };

    /**
     * This is a simple render loop that can be started if there is only one <code>Viewer</code> widget
     * on your page.  If you wish to
     * customize your render loop, avoid this function and instead use code similar to the following example.
     * @function
     * @memberof Viewer.prototype
     * @see requestAnimationFrame
     * @example
     * // This takes the place of startRenderLoop for a single widget.
     *
     * var animationController = widget.animationController;
     * function updateAndRender() {
     *     var currentTime = animationController.update();
     *     widget.update(currentTime);
     *     widget.render();
     *     requestAnimationFrame(updateAndRender);
     * }
     * updateAndRender();
     * @example
     * // This example requires widget1 and widget2 to share an animationController
     * // (for example, widget2's constructor was called with a copy of widget1's
     * // animationController).
     *
     * function updateAndRender() {
     *     var currentTime = animationController.update();
     *     widget1.update(currentTime);
     *     widget2.update(currentTime);
     *     widget1.render();
     *     widget2.render();
     *     requestAnimationFrame(updateAndRender);
     * }
     * updateAndRender();
     * @example
     * // This example uses separate animationControllers for widget1 and widget2.
     * // These widgets can animate at different rates and pause individually.
     *
     * function updateAndRender() {
     *     var currentTime = widget1.animationController.update();
     *     widget1.update(currentTime);
     *     widget1.render();
     *     currentTime = widget2.animationController.update();
     *     widget2.update(currentTime);
     *     widget2.render();
     *     requestAnimationFrame(updateAndRender);
     * }
     * updateAndRender();
     */
    Viewer.prototype.startRenderLoop = function() {
        var widget = this;

        function updateAndRender() {
            var currentTime = new JulianDate();
            widget.update(currentTime);
            widget.render();
            requestAnimationFrame(updateAndRender);
        }
        updateAndRender();
    };

    return Viewer;
});
