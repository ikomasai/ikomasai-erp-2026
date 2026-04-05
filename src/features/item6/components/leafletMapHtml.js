/**
 * Leaflet CRS.Simple を利用したキャンパスマップの HTML テンプレート
 * Native (iOS/Android) では WebView 内でこの HTML を描画する。
 *
 * @param {Object} params - HTML生成パラメータ
 * @param {string} params.mapImageBase64 - マップ画像の Base64 データURI
 * @param {number} params.imgWidth - マップ画像の幅（ピクセル）
 * @param {number} params.imgHeight - マップ画像の高さ（ピクセル）
 * @returns {string} Leaflet マップを含む完全な HTML 文字列
 */
export const buildLeafletHtml = ({ mapImageBase64, imgWidth, imgHeight }) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; background: transparent; }

    /* ドロップピン型マーカー */
    .marker-pin {
      display: flex;
      flex-direction: column;
      align-items: center;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
      cursor: pointer;
    }
    .marker-pin svg {
      width: 32px;
      height: 40px;
      transition: transform 0.15s ease;
    }
    .marker-pin:hover svg {
      transform: scale(1.15);
    }
    .marker-pin .pin-label {
      margin-top: 2px;
      background: rgba(0,0,0,0.78);
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .marker-pin .pin-subtitle {
      margin-top: 2px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .marker-pin.selected .pin-label {
      background: #E53935;
    }
    .marker-pin.highlighted .pin-label {
      background: #43A047;
    }
    .marker-pin.draft .pin-label {
      background: #FF9800;
    }
    /* 選択時のバウンスアニメーション */
    .marker-pin.selected svg {
      animation: pin-bounce 0.4s ease;
    }
    @keyframes pin-bounce {
      0% { transform: translateY(0); }
      30% { transform: translateY(-8px); }
      60% { transform: translateY(0); }
      80% { transform: translateY(-3px); }
      100% { transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function() {
      var IMG_WIDTH = ${imgWidth};
      var IMG_HEIGHT = ${imgHeight};
      var bounds = [[0, 0], [IMG_HEIGHT, IMG_WIDTH]];

      var map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 3,
        zoomSnap: 0.5,
        maxBounds: [[-50, -50], [IMG_HEIGHT + 50, IMG_WIDTH + 50]],
        maxBoundsViscosity: 0.8
      });

      L.imageOverlay('${mapImageBase64}', bounds).addTo(map);
      map.fitBounds(bounds);

      /** @type {Object<string, L.Marker>} マーカーIDをキーとするマーカーマップ */
      var markers = {};
      /** @type {L.Marker|null} ドラフト（新規登録用）マーカー */
      var draftMarker = null;
      /** @type {boolean} 編集モードが有効か */
      var canEdit = false;

      /**
       * 緯度経度をLeaflet CRS.Simple座標に変換する
       * @param {number} lat - 緯度
       * @param {number} lng - 経度
       * @param {Object} campusBounds - キャンパス座標範囲
       * @returns {Array<number>} [y, x] 形式のLeaflet座標
       */
      function geoToPixel(lat, lng, campusBounds) {
        var xRatio = (lng - campusBounds.longitudeMin) / (campusBounds.longitudeMax - campusBounds.longitudeMin);
        var yRatio = 1 - (lat - campusBounds.latitudeMin) / (campusBounds.latitudeMax - campusBounds.latitudeMin);
        return [yRatio * IMG_HEIGHT, xRatio * IMG_WIDTH];
      }

      /**
       * Leaflet CRS.Simple座標を緯度経度に変換する
       * @param {number} y - Leaflet Y座標
       * @param {number} x - Leaflet X座標
       * @param {Object} campusBounds - キャンパス座標範囲
       * @returns {Object} { latitude, longitude }
       */
      function pixelToGeo(y, x, campusBounds) {
        var xRatio = x / IMG_WIDTH;
        var yRatio = y / IMG_HEIGHT;
        return {
          latitude: campusBounds.latitudeMin + (1 - yRatio) * (campusBounds.latitudeMax - campusBounds.latitudeMin),
          longitude: campusBounds.longitudeMin + xRatio * (campusBounds.longitudeMax - campusBounds.longitudeMin)
        };
      }

      /**
       * SVG ドロップピン型の DivIcon を生成する
       * 状態に応じてピンの色を変更し、場所名ラベルを表示する
       * @param {string} name - 表示名
       * @param {boolean} isSelected - 選択状態か（赤）
       * @param {boolean} isHighlighted - ハイライト状態か（緑）
       * @param {boolean} isDraft - ドラフトか（オレンジ）
       * @returns {L.DivIcon}
       */
      function createIcon(name, subtitle, isSelected, isHighlighted, isDraft) {
        var color = isDraft ? '#FF9800'
          : isSelected ? '#E53935'
          : isHighlighted ? '#43A047'
          : '#1976D2';
        var cls = 'marker-pin';
        if (isDraft) cls += ' draft';
        else if (isSelected) cls += ' selected';
        else if (isHighlighted) cls += ' highlighted';
        var html = '<div class="' + cls + '">'
          + '<svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">'
          + '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="' + color + '"/>'
          + '<circle cx="12" cy="12" r="5" fill="#fff"/>'
          + '</svg>'
          + '<span class="pin-label">' + escapeHtml(name) + '</span>'
          + (subtitle ? '<span class="pin-subtitle">' + escapeHtml(subtitle) + '</span>' : '')
          + '</div>';
        return L.divIcon({
          className: '',
          html: html,
          iconSize: subtitle ? [120, 70] : [32, 52],
          iconAnchor: subtitle ? [60, 54] : [16, 44]
        });
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      /**
       * React Native からのメッセージを処理する
       * @param {MessageEvent} event - postMessage イベント
       */
      function handleMessage(event) {
        var data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        if (data.type === 'updateMarkers') {
          updateMarkers(data.payload);
        } else if (data.type === 'focusLocation') {
          focusOnLocation(data.payload);
        } else if (data.type === 'updateDraft') {
          updateDraftMarker(data.payload);
        }
      }

      /**
       * すべてのマーカーを更新する
       * @param {Object} payload - マーカー更新データ
       */
      function updateMarkers(payload) {
        var locations = payload.locations || [];
        var selectedId = payload.selectedLocationId || '';
        var highlightedId = payload.highlightedLocationId || '';
        var campusBounds = payload.campusBounds;

        /* 既存マーカーを全削除 */
        Object.keys(markers).forEach(function(id) {
          map.removeLayer(markers[id]);
        });
        markers = {};

        /* アクティブな場所のマーカーを追加 */
        locations.forEach(function(loc) {
          if (loc.is_active === false) return;
          var pos = geoToPixel(Number(loc.latitude), Number(loc.longitude), campusBounds);
          var isSelected = loc.id === selectedId;
          var isHighlighted = loc.id === highlightedId;
          var icon = createIcon(loc.name, loc.memberSummary || '', isSelected, isHighlighted, false);
          var m = L.marker(pos, { icon: icon, draggable: false })
            .addTo(map);

          m.on('click', function() {
            sendToRN({ type: 'locationPress', payload: { id: loc.id } });
          });

          markers[loc.id] = m;
        });
      }

      /**
       * ドラフトマーカーを更新・表示する
       * @param {Object} payload - ドラフト座標データ
       */
      function updateDraftMarker(payload) {
        if (!payload || !payload.coordinate || !payload.campusBounds) {
          if (draftMarker) {
            map.removeLayer(draftMarker);
            draftMarker = null;
          }
          return;
        }
        var pos = geoToPixel(
          Number(payload.coordinate.latitude),
          Number(payload.coordinate.longitude),
          payload.campusBounds
        );
        var icon = createIcon(payload.label || '選択中の位置', '', false, false, true);

        if (draftMarker) {
          draftMarker.setLatLng(pos);
          draftMarker.setIcon(icon);
        } else {
          draftMarker = L.marker(pos, { icon: icon }).addTo(map);
        }
      }

      /**
       * 指定した場所にマップをパンする
       * @param {Object} payload - フォーカス対象データ
       */
      function focusOnLocation(payload) {
        if (!payload || !payload.coordinate || !payload.campusBounds) return;
        var pos = geoToPixel(
          Number(payload.coordinate.latitude),
          Number(payload.coordinate.longitude),
          payload.campusBounds
        );
        map.setView(pos, 1, { animate: true });
      }

      /**
       * React Native にメッセージを送信する
       * @param {Object} msg - 送信するメッセージオブジェクト
       */
      function sendToRN(msg) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        } else {
          /* Web版: カスタムイベントで通知 */
          window.dispatchEvent(new CustomEvent('leafletMapEvent', { detail: msg }));
        }
      }

      function applyInteractionMode() {
        map.dragging.enable();
        map.getContainer().style.cursor = canEdit ? 'grab' : '';
      }

      /* 初回のモード適用 */
      applyInteractionMode();

      /* マップタップでピンを立てるイベント */
      map.on('click', function(e) {
        if (!canEdit) return;
        sendToRN({ type: 'boardPress', payload: pixelToGeo(e.latlng.lat, e.latlng.lng, window._campusBounds || {}) });
      });

      /* メッセージ受信の設定 */
      window.addEventListener('message', handleMessage);
      document.addEventListener('message', handleMessage);

      /* グローバルAPI: Web版から直接呼べるようにする */
      window.leafletMap = {
        updateMarkers: function(payload) { updateMarkers(payload); window._campusBounds = payload.campusBounds; },
        focusLocation: function(payload) { focusOnLocation(payload); },
        updateDraft: function(payload) { updateDraftMarker(payload); },
        getMap: function() { return map; }
      };

      /* 読み込み完了を通知 */
      sendToRN({ type: 'mapReady' });
    })();
  </script>
</body>
</html>
`;
};
