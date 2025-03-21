'use strict';

var d3 = require('@plotly/d3');

var Lib = require('../lib');
var Drawing = require('../components/drawing');
var Color = require('../components/color');

var xmlnsNamespaces = require('../constants/xmlns_namespaces');
var DOUBLEQUOTE_REGEX = /"/g;
var DUMMY_SUB = 'TOBESTRIPPED';
var DUMMY_REGEX = new RegExp('("' + DUMMY_SUB + ')|(' + DUMMY_SUB + '")', 'g');

function htmlEntityDecode(s) {
    var hiddenDiv = d3.select('body').append('div').style({display: 'none'}).html('');
    var replaced = s.replace(/(&[^;]*;)/gi, function(d) {
        if(d === '&lt;') { return '&#60;'; } // special handling for brackets
        if(d === '&rt;') { return '&#62;'; }
        if(d.indexOf('<') !== -1 || d.indexOf('>') !== -1) { return ''; }
        return hiddenDiv.html(d).text(); // everything else, let the browser decode it to unicode
    });
    hiddenDiv.remove();
    return replaced;
}

function xmlEntityEncode(str) {
    return str.replace(/&(?!\w+;|\#[0-9]+;| \#x[0-9A-F]+;)/g, '&amp;');
}

module.exports = function toSVG(gd, format, scale) {
    var fullLayout = gd._fullLayout;
    var svg = fullLayout._paper;
    var toppaper = fullLayout._toppaper;
    var width = fullLayout.width;
    var height = fullLayout.height;
    var i;

    // make background color a rect in the svg, then revert after scraping
    // all other alterations have been dealt with by properly preparing the svg
    // in the first place... like setting cursors with css classes so we don't
    // have to remove them, and providing the right namespaces in the svg to
    // begin with
    svg.insert('rect', ':first-child')
        .call(Drawing.setRect, 0, 0, width, height)
        .call(Color.fill, fullLayout.paper_bgcolor);

    // subplot-specific to-SVG methods
    // which notably add the contents of the gl-container
    // into the main svg node
    var basePlotModules = fullLayout._basePlotModules || [];
    for(i = 0; i < basePlotModules.length; i++) {
        var _module = basePlotModules[i];

        if(_module.toSVG) _module.toSVG(gd);
    }

    // add top items above them assumes everything in toppaper is either
    // a group or a defs, and if it's empty (like hoverlayer) we can ignore it.
    if(toppaper) {
        var nodes = toppaper.node().childNodes;

        // make copy of nodes as childNodes prop gets mutated in loop below
        var topGroups = Array.prototype.slice.call(nodes);

        for(i = 0; i < topGroups.length; i++) {
            var topGroup = topGroups[i];

            if(topGroup.childNodes.length) svg.node().appendChild(topGroup);
        }
    }

    // remove draglayer for Adobe Illustrator compatibility
    if(fullLayout._draggers) {
        fullLayout._draggers.remove();
    }

    // in case the svg element had an explicit background color, remove this
    // we want the rect to get the color so it's the right size; svg bg will
    // fill whatever container it's displayed in regardless of plot size.
    svg.node().style.background = '';

    svg.selectAll('text')
        .attr({'data-unformatted': null, 'data-math': null})
        .each(function() {
            var txt = d3.select(this);

            // hidden text is pre-formatting mathjax, the browser ignores it
            // but in a static plot it's useless and it can confuse batik
            // we've tried to standardize on display:none but make sure we still
            // catch visibility:hidden if it ever arises
            if(this.style.visibility === 'hidden' || this.style.display === 'none') {
                txt.remove();
                return;
            } else {
                // clear other visibility/display values to default
                // to not potentially confuse non-browser SVG implementations
                txt.style({visibility: null, display: null});
            }

            // Font family styles break things because of quotation marks,
            // so we must remove them *after* the SVG DOM has been serialized
            // to a string (browsers convert singles back)
            var ff = this.style.fontFamily;
            if(ff && ff.indexOf('"') !== -1) {
                txt.style('font-family', ff.replace(DOUBLEQUOTE_REGEX, DUMMY_SUB));
            }

            // Drop normal font-weight, font-style and font-variant to reduce the size
            var fw = this.style.fontWeight;
            if(fw && (fw === 'normal' || fw === '400')) { // font-weight 400 is similar to normal
                txt.style('font-weight', undefined);
            }
            var fs = this.style.fontStyle;
            if(fs && fs === 'normal') {
                txt.style('font-style', undefined);
            }
            var fv = this.style.fontVariant;
            if(fv && fv === 'normal') {
                txt.style('font-variant', undefined);
            }
        });

    svg.selectAll('.gradient_filled,.pattern_filled').each(function() {
        var pt = d3.select(this);

        // similar to font family styles above,
        // we must remove " after the SVG DOM has been serialized
        var fill = this.style.fill;
        if(fill && fill.indexOf('url(') !== -1) {
            pt.style('fill', fill.replace(DOUBLEQUOTE_REGEX, DUMMY_SUB));
        }

        var stroke = this.style.stroke;
        if(stroke && stroke.indexOf('url(') !== -1) {
            pt.style('stroke', stroke.replace(DOUBLEQUOTE_REGEX, DUMMY_SUB));
        }
    });

    if(format === 'pdf' || format === 'eps') {
        // these formats make the extra line MathJax adds around symbols look super thick in some cases
        // it looks better if this is removed entirely.
        svg.selectAll('#MathJax_SVG_glyphs path')
            .attr('stroke-width', 0);
    }

    if(format === 'svg' && scale) {
        svg.attr('width', scale * width);
        svg.attr('height', scale * height);
        svg.attr('viewBox', '0 0 ' + width + ' ' + height);
    }

    var s = new window.XMLSerializer().serializeToString(svg.node());
    s = htmlEntityDecode(s);
    s = xmlEntityEncode(s);

    // Fix quotations around font strings and gradient URLs
    s = s.replace(DUMMY_REGEX, '\'');

    return s;
};
