const margin = { top: 20, right: 30, bottom: 40, left: 60 };
const chartHeight = 460;

const colors = {
    all: "#475569",
    food: "#10b981",
    shelter: "#3b82f6",
    gas: "#f59e0b",
    transportation: "#8b5cf6"
};

const prettyNames = {
    all: "All-Items",
    food: "Food",
    shelter: "Shelter",
    gas: "Gas",
    transportation: "Transportation"
};

let rawData = [];
let groupedData = new Map();
let years = [];
let categories = [];

let svg, chartGroup, xScale, yScale, xAxisGroup, yAxisGroup, gridGroup, zeroLine;
let lineGroup, hoverGroup, hoverLine, hoverDots, overlayRect, tooltip;
let chartWidth = 0;

const chartContainer = d3.select("#chart");
const legendContainer = d3.select("#legend");
const categoryCards = d3.select("#categoryCards");

const yearSlider = document.getElementById("yearSlider");
const yearLabel = document.getElementById("yearLabel");
const officialRate = document.getElementById("officialRate");
const personalRateStat = document.getElementById("personalRateStat");

const housingSlider = document.getElementById("housingSlider");
const foodSlider = document.getElementById("foodSlider");
const gasSlider = document.getElementById("gasSlider");
const otherSlider = document.getElementById("otherSlider");

const housingValue = document.getElementById("housingValue");
const foodValue = document.getElementById("foodValue");
const gasValue = document.getElementById("gasValue");
const otherValue = document.getElementById("otherValue");
const weightTotalNote = document.getElementById("weightTotalNote");

const officialBar = document.getElementById("officialBar");
const personalBar = document.getElementById("personalBar");
const officialBarLabel = document.getElementById("officialBarLabel");
const personalBarLabel = document.getElementById("personalBarLabel");
const comparisonText = document.getElementById("comparisonText");

d3.csv("data/inflation_cleaned.csv", d => ({
    year: +d.year,
    category: d.category.trim().toLowerCase(),
    value: +d.value
})).then(data => {
    rawData = data
        .filter(d => !Number.isNaN(d.year) && !Number.isNaN(d.value))
        .sort((a, b) => a.year - b.year);

    groupedData = d3.group(rawData, d => d.category);
    categories = Array.from(groupedData.keys()).filter(c =>
        ["all", "food", "shelter", "gas", "transportation"].includes(c)
    );

    years = Array.from(new Set(rawData.map(d => d.year))).sort((a, b) => a - b);

    setupControls();
    setupChart();
    renderLegend();
    updateAll();

    window.addEventListener("resize", handleResize);
});

function setupControls() {
    yearSlider.min = years[0];
    yearSlider.max = years[years.length - 1];
    yearSlider.step = 1;
    yearSlider.value = years[years.length - 1];
    yearLabel.textContent = `${yearSlider.value}`;

    yearSlider.addEventListener("input", () => {
        yearLabel.textContent = `${yearSlider.value}`;
        renderCards();
        updateStats();
        updateComparison();
    });

    setupWeightSliders();
    updateWeightLabels();
}

function setupWeightSliders() {
    const sliders = [housingSlider, foodSlider, gasSlider, otherSlider];

    sliders.forEach(slider => {
        slider.addEventListener("input", event => {
            rebalanceSliders(event.target);
            updateWeightLabels();
            updateComparison();
        });
    });
}

function rebalanceSliders(changedSlider) {
    const sliders = [housingSlider, foodSlider, gasSlider, otherSlider];
    const changedValue = +changedSlider.value;
    const remaining = 100 - changedValue;

    const others = sliders.filter(s => s !== changedSlider);
    const othersTotal = d3.sum(others, s => +s.value);

    if (othersTotal === 0) {
        const base = Math.floor(remaining / others.length);
        let leftover = remaining - base * others.length;

        others.forEach(slider => {
            const value = base + (leftover > 0 ? 1 : 0);
            slider.value = value;
            if (leftover > 0) leftover -= 1;
        });
    } else {
        let assigned = 0;
        others.forEach((slider, i) => {
            if (i === others.length - 1) {
                slider.value = remaining - assigned;
            } else {
                const value = Math.round((+slider.value / othersTotal) * remaining);
                slider.value = value;
                assigned += value;
            }
        });
    }
}

function updateWeightLabels() {
    housingValue.textContent = `${housingSlider.value}%`;
    foodValue.textContent = `${foodSlider.value}%`;
    gasValue.textContent = `${gasSlider.value}%`;
    otherValue.textContent = `${otherSlider.value}%`;

    const total = +housingSlider.value + +foodSlider.value + +gasSlider.value + +otherSlider.value;
    weightTotalNote.textContent = `Total: ${total}%`;
}

function setupChart() {
    chartWidth = chartContainer.node().getBoundingClientRect().width - margin.left - margin.right;

    svg = chartContainer.append("svg")
        .attr("width", chartWidth + margin.left + margin.right)
        .attr("height", chartHeight + margin.top + margin.bottom);

    chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    xScale = d3.scaleLinear()
        .domain(d3.extent(years))
        .range([0, chartWidth]);

    yScale = d3.scaleLinear()
        .domain([
            Math.min(-1, d3.min(rawData, d => d.value) - 0.5),
            d3.max(rawData, d => d.value) + 0.5
        ])
        .nice()
        .range([chartHeight, 0]);

    gridGroup = chartGroup.append("g").attr("class", "grid");

    xAxisGroup = chartGroup.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${chartHeight})`);

    yAxisGroup = chartGroup.append("g")
        .attr("class", "axis");

    zeroLine = chartGroup.append("line")
        .attr("class", "zero-line");

    lineGroup = chartGroup.append("g");

    hoverGroup = chartGroup.append("g").style("display", "none");

    hoverLine = hoverGroup.append("line")
        .attr("class", "hover-line")
        .attr("y1", 0)
        .attr("y2", chartHeight);

    hoverDots = hoverGroup.append("g");

    overlayRect = chartGroup.append("rect")
        .attr("fill", "transparent")
        .attr("pointer-events", "all")
        .on("mouseenter", () => {
            hoverGroup.style("display", null);
            tooltip.style("opacity", 1);
        })
        .on("mouseleave", () => {
            hoverGroup.style("display", "none");
            tooltip.style("opacity", 0);
        })
        .on("mousemove", handleHoverMove);

    tooltip = chartContainer.append("div")
        .attr("class", "tooltip multi-tooltip");
}

function renderLegend() {
    legendContainer.selectAll("*").remove();

    const legendOrder = ["all", "food", "gas", "shelter", "transportation"]
        .filter(category => categories.includes(category));

    legendOrder.forEach(category => {
        const item = legendContainer.append("div").attr("class", "legend-item");
        item.append("span")
            .attr("class", "legend-swatch")
            .style("background", colors[category] || "#999");
        item.append("span").text(prettyNames[category] || category);
    });
}

function updateAll() {
    updateChart();
    renderCards();
    updateStats();
    updateComparison();
}

function updateChart() {
    xScale.range([0, chartWidth]);
    yScale.range([chartHeight, 0]);

    gridGroup.call(
        d3.axisLeft(yScale)
            .tickSize(-chartWidth)
            .tickFormat("")
    );

    xAxisGroup.call(
        d3.axisBottom(xScale)
            .tickFormat(d3.format("d"))
            .ticks(Math.min(years.length, 8))
    );

    yAxisGroup.call(
        d3.axisLeft(yScale)
            .ticks(6)
            .tickFormat(d => `${d}%`)
    );

    zeroLine
        .attr("x1", 0)
        .attr("x2", chartWidth)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0));

    const line = d3.line()
        .x(d => xScale(d.year))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    const series = categories.map(category => ({
        category,
        values: groupedData.get(category).sort((a, b) => a.year - b.year)
    }));

    const paths = lineGroup.selectAll(".line-path")
        .data(series, d => d.category);

    paths.enter()
        .append("path")
        .attr("class", "line-path")
        .merge(paths)
        .attr("stroke", d => colors[d.category] || "#fff")
        .attr("d", d => line(d.values));

    paths.exit().remove();

    overlayRect
        .attr("width", chartWidth)
        .attr("height", chartHeight);

    hoverLine
        .attr("y1", 0)
        .attr("y2", chartHeight);
}

function handleHoverMove(event) {
    const [mx] = d3.pointer(event);
    const hoveredYear = Math.round(xScale.invert(mx));
    const clampedYear = Math.max(years[0], Math.min(years[years.length - 1], hoveredYear));

    const yearData = categories.map(category => {
        const row = groupedData.get(category)?.find(d => d.year === clampedYear);
        return {
            category,
            value: row ? row.value : null
        };
    });

    hoverLine
        .attr("x1", xScale(clampedYear))
        .attr("x2", xScale(clampedYear));

    const dots = hoverDots.selectAll("circle")
        .data(yearData.filter(d => d.value !== null), d => d.category);

    dots.enter()
        .append("circle")
        .attr("r", 5)
        .merge(dots)
        .attr("cx", d => xScale(clampedYear))
        .attr("cy", d => yScale(d.value))
        .attr("fill", d => colors[d.category] || "#fff")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2);

    dots.exit().remove();

    const ordered = ["all", "food", "shelter", "gas", "transportation"]
        .filter(c => categories.includes(c))
        .map(category => yearData.find(d => d.category === category))
        .filter(Boolean);

    tooltip.html(`
    <div class="tooltip-title">${clampedYear}</div>
    ${ordered.map(d => `
      <div class="tooltip-row">
        <span class="tooltip-label">
          <span class="tooltip-dot" style="background:${colors[d.category]}"></span>
          ${prettyNames[d.category]}
        </span>
        <span class="tooltip-value">${d.value.toFixed(1)}%</span>
      </div>
    `).join("")}
  `);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;

    let left = xScale(clampedYear) + margin.left + 18;
    let top = 24;

    if (left + tooltipWidth > chartWidth + margin.left) {
        left = xScale(clampedYear) + margin.left - tooltipWidth - 18;
    }

    if (left < margin.left) {
        left = margin.left + 10;
    }

    if (top + tooltipHeight > chartHeight + margin.top) {
        top = chartHeight + margin.top - tooltipHeight - 10;
    }

    tooltip
        .style("left", `${left}px`)
        .style("top", `${top}px`)
        .style("opacity", 1);
}

function renderCards() {
    const selectedYear = +yearSlider.value;

    const cardOrder = ["all", "shelter", "food", "gas", "transportation"]
        .filter(category => categories.includes(category));

    const cardData = cardOrder.map(category => {
        const row = groupedData.get(category)?.find(d => d.year === selectedYear);
        return {
            category,
            value: row ? row.value : null
        };
    });

    categoryCards.selectAll("*").remove();

    const cards = categoryCards.selectAll(".category-card")
        .data(cardData)
        .enter()
        .append("div")
        .attr("class", "category-card");

    cards.append("div")
        .attr("class", "category-card-title")
        .text(d => prettyNames[d.category] || d.category);

    cards.append("div")
        .attr("class", "category-card-value")
        .style("color", d => colors[d.category] || "#fff")
        .text(d => d.value !== null ? `${d.value.toFixed(1)}%` : "—");

    cards.append("div")
        .attr("class", "category-card-sub")
        .text(d => d.value !== null ? `${selectedYear}` : "No data");
}

function updateStats() {
    const selectedYear = +yearSlider.value;
    const official = getValue("all", selectedYear);
    const personal = getPersonalRate(selectedYear);

    officialRate.textContent = `${official.toFixed(1)}%`;
    personalRateStat.textContent = `${personal.toFixed(1)}%`;
}

function getValue(category, year) {
    const row = groupedData.get(category)?.find(d => d.year === year);
    return row ? row.value : 0;
}

function getPersonalRate(year) {
    const shelterRate = getValue("shelter", year);
    const foodRate = getValue("food", year);

    const transportRate = categories.includes("transportation")
        ? getValue("transportation", year)
        : categories.includes("gas")
            ? getValue("gas", year)
            : getValue("all", year);

    const allRate = getValue("all", year);

    return (
        (+housingSlider.value / 100) * shelterRate +
        (+foodSlider.value / 100) * foodRate +
        (+gasSlider.value / 100) * transportRate +
        (+otherSlider.value / 100) * allRate
    );
}

function updateComparison() {
    const selectedYear = +yearSlider.value;
    const official = getValue("all", selectedYear);
    const personal = getPersonalRate(selectedYear);

    const maxRate = Math.max(official, personal, 1);
    const scaleHeight = d3.scaleLinear().domain([0, maxRate]).range([30, 220]);

    officialBar.style.height = `${scaleHeight(official)}px`;
    personalBar.style.height = `${scaleHeight(personal)}px`;

    officialBarLabel.textContent = `${official.toFixed(1)}%`;
    personalBarLabel.textContent = `${personal.toFixed(1)}%`;

    const diff = personal - official;

    if (Math.abs(diff) < 0.2) {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is almost identical to the official inflation rate.`;
    } else if (diff > 0) {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is ${diff.toFixed(1)} percentage points above the official inflation rate. A basket weighted toward fast-rising essentials can make inflation feel harsher than the headline number suggests.`;
    } else {
        comparisonText.textContent =
            `In ${selectedYear}, your basket is ${Math.abs(diff).toFixed(1)} percentage points below the official inflation rate. Your spending mix is less exposed to the fastest-rising categories.`;
    }

    updateStats();
}

function handleResize() {
    const newWidth = chartContainer.node().getBoundingClientRect().width - margin.left - margin.right;
    if (newWidth <= 0) return;

    chartWidth = newWidth;

    svg
        .attr("width", chartWidth + margin.left + margin.right)
        .attr("height", chartHeight + margin.top + margin.bottom);

    updateChart();
}