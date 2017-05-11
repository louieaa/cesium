/*global define*/
define([
        '../Core/AttributeCompression',
        '../Core/Cartesian2',
        '../Core/Cartesian3',
        '../Core/Color',
        '../Core/ComponentDatatype',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/getAbsoluteUri',
        '../Core/getBaseUri',
        '../Core/getStringFromTypedArray',
        '../Core/joinUrls',
        '../Core/Math',
        '../Core/Matrix3',
        '../Core/Matrix4',
        '../Core/Quaternion',
        '../Core/RequestType',
        '../Core/Transforms',
        '../Core/TranslationRotationScale',
        '../ThirdParty/Uri',
        '../ThirdParty/when',
        './Cesium3DTileBatchTable',
        './Cesium3DTileFeature',
        './Cesium3DTileFeatureTable',
        './ModelInstanceCollection'
    ], function(
        AttributeCompression,
        Cartesian2,
        Cartesian3,
        Color,
        ComponentDatatype,
        defaultValue,
        defined,
        defineProperties,
        destroyObject,
        DeveloperError,
        Ellipsoid,
        getAbsoluteUri,
        getBaseUri,
        getStringFromTypedArray,
        joinUrls,
        CesiumMath,
        Matrix3,
        Matrix4,
        Quaternion,
        RequestType,
        Transforms,
        TranslationRotationScale,
        Uri,
        when,
        Cesium3DTileBatchTable,
        Cesium3DTileFeature,
        Cesium3DTileFeatureTable,
        ModelInstanceCollection) {
    'use strict';

    /**
     * Represents the contents of a
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/blob/master/TileFormats/Instanced3DModel/README.md|Instanced 3D Model}
     * tile in a {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/blob/master/README.md|3D Tiles} tileset.
     *
     * @alias Instanced3DModel3DTileContent
     * @constructor
     *
     * @private
     */
    function Instanced3DModel3DTileContent(tileset, tile, url, arrayBuffer, byteOffset) {
        this._url = url;
        this._tileset = tileset;
        this._tile = tile;
        this._modelInstanceCollection = undefined;
        this._batchTable = undefined;
        this._features = undefined;

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        this.featurePropertiesDirty = false;

        initialize(this, arrayBuffer, byteOffset);
    }

    defineProperties(Instanced3DModel3DTileContent.prototype, {
        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        featuresLength : {
            get : function() {
                return this._batchTable.featuresLength;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        pointsLength : {
            get : function() {
                return 0;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        trianglesLength : {
            get : function() {
                var model = this._modelInstanceCollection._model;
                if (defined(model)) {
                    return model.trianglesLength;
                }
                return 0;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        vertexMemorySizeInBytes : {
            get : function() {
                var model = this._modelInstanceCollection._model;
                if (defined(model)) {
                    return model.vertexMemorySizeInBytes;
                }
                return 0;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        textureMemorySizeInBytes : {
            get : function() {
                var model = this._modelInstanceCollection._model;
                if (defined(model)) {
                    return model.textureMemorySizeInBytes;
                }
                return 0;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        batchTableMemorySizeInBytes : {
            get : function() {
                return this._batchTable.memorySizeInBytes;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        innerContents : {
            get : function() {
                return undefined;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        readyPromise : {
            get : function() {
                return this._modelInstanceCollection.readyPromise;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        url: {
            get: function() {
                return this._url;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        tileset : {
            get : function() {
                return this._tileset;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        tile : {
            get : function() {
                return this._tile;
            }
        },

        /**
         * Part of the {@link Cesium3DTileContent} interface.
         */
        batchTable : {
            get : function() {
                return undefined;
            }
        }
    });

    var sizeOfUint32 = Uint32Array.BYTES_PER_ELEMENT;
    var propertyScratch1 = new Array(4);
    var propertyScratch2 = new Array(4);

    function initialize(content, arrayBuffer, byteOffset) {
        var byteStart = defaultValue(byteOffset, 0);
        byteOffset = byteStart;

        var uint8Array = new Uint8Array(arrayBuffer);
        var view = new DataView(arrayBuffer);
        byteOffset += sizeOfUint32;  // Skip magic

        //>>includeStart('debug', pragmas.debug);
        var version = view.getUint32(byteOffset, true);
        if (version !== 1) {
            throw new DeveloperError('Only Instanced 3D Model version 1 is supported. Version ' + version + ' is not.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        var byteLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        var featureTableJsonByteLength = view.getUint32(byteOffset, true);
        //>>includeStart('debug', pragmas.debug);
        if (featureTableJsonByteLength === 0) {
            throw new DeveloperError('featureTableJsonByteLength is zero, the feature table must be defined.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        var featureTableBinaryByteLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        var batchTableJsonByteLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        var batchTableBinaryByteLength = view.getUint32(byteOffset, true);
        byteOffset += sizeOfUint32;

        var gltfFormat = view.getUint32(byteOffset, true);
        //>>includeStart('debug', pragmas.debug);
        if (gltfFormat !== 1 && gltfFormat !== 0) {
            throw new DeveloperError('Only glTF format 0 (uri) or 1 (embedded) are supported. Format ' + gltfFormat + ' is not.');
        }
        //>>includeEnd('debug');
        byteOffset += sizeOfUint32;

        var featureTableString = getStringFromTypedArray(uint8Array, byteOffset, featureTableJsonByteLength);
        var featureTableJson = JSON.parse(featureTableString);
        byteOffset += featureTableJsonByteLength;

        var featureTableBinary = new Uint8Array(arrayBuffer, byteOffset, featureTableBinaryByteLength);
        byteOffset += featureTableBinaryByteLength;

        var featureTable = new Cesium3DTileFeatureTable(featureTableJson, featureTableBinary);
        var instancesLength = featureTable.getGlobalProperty('INSTANCES_LENGTH');
        featureTable.featuresLength = instancesLength;

        //>>includeStart('debug', pragmas.debug);
        if (!defined(instancesLength)) {
            throw new DeveloperError('Feature table global property: INSTANCES_LENGTH must be defined');
        }
        //>>includeEnd('debug');

        var batchTableJson;
        var batchTableBinary;
        if (batchTableJsonByteLength > 0) {
            var batchTableString = getStringFromTypedArray(uint8Array, byteOffset, batchTableJsonByteLength);
            batchTableJson = JSON.parse(batchTableString);
            byteOffset += batchTableJsonByteLength;

            if (batchTableBinaryByteLength > 0) {
                // Has a batch table binary
                batchTableBinary = new Uint8Array(arrayBuffer, byteOffset, batchTableBinaryByteLength);
                // Copy the batchTableBinary section and let the underlying ArrayBuffer be freed
                batchTableBinary = new Uint8Array(batchTableBinary);
                byteOffset += batchTableBinaryByteLength;
            }
        }

        content._batchTable = new Cesium3DTileBatchTable(content, instancesLength, batchTableJson, batchTableBinary);

        var gltfByteLength = byteStart + byteLength - byteOffset;
        //>>includeStart('debug', pragmas.debug);
        if (gltfByteLength === 0) {
            throw new DeveloperError('glTF byte length is zero, i3dm must have a glTF to instance.');
        }
        //>>includeEnd('debug');
        var gltfView = new Uint8Array(arrayBuffer, byteOffset, gltfByteLength);
        byteOffset += gltfByteLength;

        // Create model instance collection
        var collectionOptions = {
            instances : new Array(instancesLength),
            batchTable : content._batchTable,
            cull : false, // Already culled by 3D Tiles
            url : undefined,
            requestType : RequestType.TILES3D,
            gltf : undefined,
            basePath : undefined,
            incrementallyLoadTextures : false,
            upAxis : content._tileset._gltfUpAxis
        };

        if (gltfFormat === 0) {
            var gltfUrl = getStringFromTypedArray(gltfView);
            collectionOptions.url = getAbsoluteUri(joinUrls(getBaseUri(content._url, true), gltfUrl));
        } else {
            collectionOptions.gltf = gltfView;
            collectionOptions.basePath = getAbsoluteUri(getBaseUri(content._url, true));
        }

        var eastNorthUp = featureTable.getGlobalProperty('EAST_NORTH_UP');

        var rtcCenter;
        var rtcCenterArray = featureTable.getGlobalProperty('RTC_CENTER', ComponentDatatype.FLOAT, 3);
        if (defined(rtcCenterArray)) {
            rtcCenter = Cartesian3.unpack(rtcCenterArray);
        }

        var instances = collectionOptions.instances;
        var instancePosition = new Cartesian3();
        var instancePositionArray = new Array(3);
        var instanceNormalRight = new Cartesian3();
        var instanceNormalUp = new Cartesian3();
        var instanceNormalForward = new Cartesian3();
        var instanceRotation = new Matrix3();
        var instanceQuaternion = new Quaternion();
        var instanceScale = new Cartesian3();
        var instanceTranslationRotationScale = new TranslationRotationScale();
        var instanceTransform = new Matrix4();
        for (var i = 0; i < instancesLength; i++) {
            // Get the instance position
            var position = featureTable.getProperty('POSITION', ComponentDatatype.FLOAT, 3, i, propertyScratch1);
            if (!defined(position)) {
                position = instancePositionArray;
                var positionQuantized = featureTable.getProperty('POSITION_QUANTIZED', ComponentDatatype.UNSIGNED_SHORT, 3, i, propertyScratch1);
                //>>includeStart('debug', pragmas.debug);
                if (!defined(positionQuantized)) {
                    throw new DeveloperError('Either POSITION or POSITION_QUANTIZED must be defined for each instance.');
                }
                //>>includeEnd('debug');
                var quantizedVolumeOffset = featureTable.getGlobalProperty('QUANTIZED_VOLUME_OFFSET', ComponentDatatype.FLOAT, 3);
                //>>includeStart('debug', pragmas.debug);
                if (!defined(quantizedVolumeOffset)) {
                    throw new DeveloperError('Global property: QUANTIZED_VOLUME_OFFSET must be defined for quantized positions.');
                }
                //>>includeEnd('debug');
                var quantizedVolumeScale = featureTable.getGlobalProperty('QUANTIZED_VOLUME_SCALE', ComponentDatatype.FLOAT, 3);
                //>>includeStart('debug', pragmas.debug);
                if (!defined(quantizedVolumeScale)) {
                    throw new DeveloperError('Global property: QUANTIZED_VOLUME_SCALE must be defined for quantized positions.');
                }
                //>>includeEnd('debug');
                for (var j = 0; j < 3; j++) {
                    position[j] = (positionQuantized[j] / 65535.0 * quantizedVolumeScale[j]) + quantizedVolumeOffset[j];
                }
            }
            Cartesian3.unpack(position, 0, instancePosition);
            if (defined(rtcCenter)) {
                Cartesian3.add(instancePosition, rtcCenter, instancePosition);
            }
            instanceTranslationRotationScale.translation = instancePosition;

            // Get the instance rotation
            var normalUp = featureTable.getProperty('NORMAL_UP', ComponentDatatype.FLOAT, 3, i, propertyScratch1);
            var normalRight = featureTable.getProperty('NORMAL_RIGHT', ComponentDatatype.FLOAT, 3, i, propertyScratch2);
            var hasCustomOrientation = false;
            if (defined(normalUp)) {
                //>>includeStart('debug', pragmas.debug);
                if (!defined(normalRight)) {
                    throw new DeveloperError('To define a custom orientation, both NORMAL_UP and NORMAL_RIGHT must be defined.');
                }
                //>>includeEnd('debug');
                Cartesian3.unpack(normalUp, 0, instanceNormalUp);
                Cartesian3.unpack(normalRight, 0, instanceNormalRight);
                hasCustomOrientation = true;
            } else {
                var octNormalUp = featureTable.getProperty('NORMAL_UP_OCT32P', ComponentDatatype.UNSIGNED_SHORT, 2, i, propertyScratch1);
                var octNormalRight = featureTable.getProperty('NORMAL_RIGHT_OCT32P', ComponentDatatype.UNSIGNED_SHORT, 2, i, propertyScratch2);
                if (defined(octNormalUp)) {
                    //>>includeStart('debug', pragmas.debug);
                    if (!defined(octNormalRight)) {
                        throw new DeveloperError('To define a custom orientation with oct-encoded vectors, both NORMAL_UP_OCT32P and NORMAL_RIGHT_OCT32P must be defined.');
                    }
                    //>>includeEnd('debug');
                    AttributeCompression.octDecodeInRange(octNormalUp[0], octNormalUp[1], 65535, instanceNormalUp);
                    AttributeCompression.octDecodeInRange(octNormalRight[0], octNormalRight[1], 65535, instanceNormalRight);
                    hasCustomOrientation = true;
                } else if (eastNorthUp) {
                    Transforms.eastNorthUpToFixedFrame(instancePosition, Ellipsoid.WGS84, instanceTransform);
                    Matrix4.getRotation(instanceTransform, instanceRotation);
                } else {
                    Matrix3.clone(Matrix3.IDENTITY, instanceRotation);
                }
            }
            if (hasCustomOrientation) {
                Cartesian3.cross(instanceNormalRight, instanceNormalUp, instanceNormalForward);
                Cartesian3.normalize(instanceNormalForward, instanceNormalForward);
                Matrix3.setColumn(instanceRotation, 0, instanceNormalRight, instanceRotation);
                Matrix3.setColumn(instanceRotation, 1, instanceNormalUp, instanceRotation);
                Matrix3.setColumn(instanceRotation, 2, instanceNormalForward, instanceRotation);
            }
            Quaternion.fromRotationMatrix(instanceRotation, instanceQuaternion);
            instanceTranslationRotationScale.rotation = instanceQuaternion;

            // Get the instance scale
            instanceScale.x = 1.0;
            instanceScale.y = 1.0;
            instanceScale.z = 1.0;
            var scale = featureTable.getProperty('SCALE', ComponentDatatype.FLOAT, 1, i);
            if (defined(scale)) {
                Cartesian3.multiplyByScalar(instanceScale, scale, instanceScale);
            }
            var nonUniformScale = featureTable.getProperty('SCALE_NON_UNIFORM', ComponentDatatype.FLOAT, 3, i, propertyScratch1);
            if (defined(nonUniformScale)) {
                instanceScale.x *= nonUniformScale[0];
                instanceScale.y *= nonUniformScale[1];
                instanceScale.z *= nonUniformScale[2];
            }
            instanceTranslationRotationScale.scale = instanceScale;

            // Get the batchId
            var batchId = featureTable.getProperty('BATCH_ID', ComponentDatatype.UNSIGNED_SHORT, 1, i);
            if (!defined(batchId)) {
                // If BATCH_ID semantic is undefined, batchId is just the instance number
                batchId = i;
            }

            // Create the model matrix and the instance
            Matrix4.fromTranslationRotationScale(instanceTranslationRotationScale, instanceTransform);
            var modelMatrix = instanceTransform.clone();
            instances[i] = {
                modelMatrix : modelMatrix,
                batchId : batchId
            };
        }

        content._modelInstanceCollection = new ModelInstanceCollection(collectionOptions);
    }

    function createFeatures(content) {
        var tileset = content._tileset;
        var featuresLength = content.featuresLength;
        if (!defined(content._features) && (featuresLength > 0)) {
            var features = new Array(featuresLength);
            for (var i = 0; i < featuresLength; ++i) {
                features[i] = new Cesium3DTileFeature(tileset, content, i);
            }
            content._features = features;
        }
    }

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.hasProperty = function(batchId, name) {
        return this._batchTable.hasProperty(batchId, name);
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.getFeature = function(batchId) {
        var featuresLength = this.featuresLength;
        //>>includeStart('debug', pragmas.debug);
        if (!defined(batchId) || (batchId < 0) || (batchId >= featuresLength)) {
            throw new DeveloperError('batchId is required and between zero and featuresLength - 1 (' + (featuresLength - 1) + ').');
        }
        //>>includeEnd('debug');

        createFeatures(this);
        return this._features[batchId];
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.applyDebugSettings = function(enabled, color) {
        color = enabled ? color : Color.WHITE;
        this._batchTable.setAllColor(color);
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.applyStyle = function(frameState, style) {
        this._batchTable.applyStyle(frameState, style);
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.update = function(tileset, frameState) {
        var commandStart = frameState.commandList.length;

        // In the PROCESSING state we may be calling update() to move forward
        // the content's resource loading.  In the READY state, it will
        // actually generate commands.
        this._batchTable.update(tileset, frameState);
        this._modelInstanceCollection.modelMatrix = this._tile.computedTransform;
        this._modelInstanceCollection.shadows = this._tileset.shadows;
        this._modelInstanceCollection.debugWireframe = this._tileset.debugWireframe;
        this._modelInstanceCollection.update(frameState);

        // If any commands were pushed, add derived commands
        var commandEnd = frameState.commandList.length;
        if ((commandStart < commandEnd) && frameState.passes.render) {
            this._batchTable.addDerivedCommands(frameState, commandStart);
        }
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Part of the {@link Cesium3DTileContent} interface.
     */
    Instanced3DModel3DTileContent.prototype.destroy = function() {
        this._modelInstanceCollection = this._modelInstanceCollection && this._modelInstanceCollection.destroy();
        this._batchTable = this._batchTable && this._batchTable.destroy();

        return destroyObject(this);
    };
    return Instanced3DModel3DTileContent;
});
