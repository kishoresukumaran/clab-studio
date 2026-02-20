import React from "react";

const YamlPreview = ({ yaml }) => (
  <div className="yaml-preview">
    <h3>Generated YAML</h3>
    <textarea value={yaml} readOnly rows={20} cols={50}></textarea>
  </div>
);

export default YamlPreview;
