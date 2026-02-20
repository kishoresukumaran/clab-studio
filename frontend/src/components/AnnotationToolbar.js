import React, { useState } from 'react';
import { 
  MousePointer, 
  Type, 
  Square, 
  Circle, 
  ArrowRight, 
  Minus, 
  Palette, 
  Trash2,
  Bold,
  Italic,
  Underline
} from 'lucide-react';

const AnnotationToolbar = ({ 
  activeTool, 
  setActiveTool, 
  onDeleteSelected,
  annotationColor,
  setAnnotationColor,
  textStyle,
  setTextStyle,
  shapeStyle,
  setShapeStyle
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextOptions, setShowTextOptions] = useState(false);
  const [showShapeOptions, setShowShapeOptions] = useState(false);

  const tools = [
    { id: 'select', icon: MousePointer, name: 'Select', tooltip: 'Select and move annotations' },
    { id: 'text', icon: Type, name: 'Text', tooltip: 'Add text labels' },
    { id: 'rectangle', icon: Square, name: 'Rectangle', tooltip: 'Click to create rectangles' },
    { id: 'circle', icon: Circle, name: 'Circle', tooltip: 'Click to create circles' }
  ];

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
    '#000000', '#808080', '#FFFFFF'
  ];

  const handleToolSelect = (toolId) => {
    setActiveTool(toolId);
    setShowColorPicker(false);
    setShowTextOptions(false);
    setShowShapeOptions(false);
  };

  const handleColorSelect = (color) => {
    setAnnotationColor(color);
    setShowColorPicker(false);
  };

  const toggleTextStyle = (style) => {
    setTextStyle(prev => ({
      ...prev,
      [style]: !prev[style]
    }));
  };

  return (
    <div className="annotation-toolbar">
      {/* Main tool buttons */}
      <div className="tool-group">
        {tools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <button
              key={tool.id}
              className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => handleToolSelect(tool.id)}
              title={tool.tooltip}
            >
              <IconComponent size={18} />
            </button>
          );
        })}
      </div>

      {/* Color picker */}
      <div className="tool-group">
        <button
          className="tool-button color-button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          title="Color picker"
          style={{ backgroundColor: annotationColor }}
        >
          <Palette size={18} />
        </button>
        
        {showColorPicker && (
          <div className="color-picker-dropdown">
            <div className="color-grid">
              {colors.map((color) => (
                <div
                  key={color}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Text styling options */}
      {activeTool === 'text' && (
        <div className="tool-group">
          <button
            className="style-button"
            onClick={() => setShowTextOptions(!showTextOptions)}
            title="Text options"
          >
            Aa
          </button>
          
          {showTextOptions && (
            <div className="text-options-dropdown">
              <div className="option-row">
                <label>Size:</label>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={textStyle.fontSize}
                  onChange={(e) => setTextStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                />
                <span>{textStyle.fontSize}px</span>
              </div>
              
              <div className="option-row">
                <button
                  className={`style-toggle ${textStyle.bold ? 'active' : ''}`}
                  onClick={() => toggleTextStyle('bold')}
                >
                  <Bold size={14} />
                </button>
                <button
                  className={`style-toggle ${textStyle.italic ? 'active' : ''}`}
                  onClick={() => toggleTextStyle('italic')}
                >
                  <Italic size={14} />
                </button>
                <button
                  className={`style-toggle ${textStyle.underline ? 'active' : ''}`}
                  onClick={() => toggleTextStyle('underline')}
                >
                  <Underline size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shape styling options */}
      {['rectangle', 'circle'].includes(activeTool) && (
        <div className="tool-group">
          <button
            className="style-button"
            onClick={() => setShowShapeOptions(!showShapeOptions)}
            title="Shape options"
          >
            ⚙️
          </button>
          
          {showShapeOptions && (
            <div className="shape-options-dropdown">
              <div className="option-row">
                <label>Stroke Width:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={shapeStyle.strokeWidth}
                  onChange={(e) => setShapeStyle(prev => ({ ...prev, strokeWidth: parseInt(e.target.value) }))}
                />
                <span>{shapeStyle.strokeWidth}px</span>
              </div>
              
              <div className="option-row">
                <label>Fill Opacity:</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={shapeStyle.fillOpacity}
                  onChange={(e) => setShapeStyle(prev => ({ ...prev, fillOpacity: parseFloat(e.target.value) }))}
                />
                <span>{Math.round(shapeStyle.fillOpacity * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete button */}
      <div className="tool-group">
        <button
          className="tool-button delete-button"
          onClick={onDeleteSelected}
          title="Delete selected (Del/Backspace)"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default AnnotationToolbar; 