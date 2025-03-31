import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import { feature } from 'topojson-client';

const USMap = ({ data }) => {
  const svgRef = useRef();

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const path = d3.geoPath();
    const projection = d3.geoAlbersUsa()
      .scale(1000)
      .translate([400, 300]);

    // Create color scale
    const colorScale = scaleLinear()
      .domain([0, Math.max(...Object.values(data))])
      .range(['#f7fbff', '#08519c']);

    // Load US map data
    fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
      .then(response => response.json())
      .then(us => {
        const states = feature(us, us.objects.states);

        // Draw states
        svg.selectAll('path')
          .data(states.features)
          .enter()
          .append('path')
          .attr('d', path.projection(projection))
          .attr('fill', d => {
            const stateName = d.properties.name;
            return data[stateName] ? colorScale(data[stateName]) : '#eee';
          })
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5);
      });
  }, [data]);

  return (
    <svg ref={svgRef} width={800} height={600}>
      <g className="states"></g>
    </svg>
  );
};

export default USMap;