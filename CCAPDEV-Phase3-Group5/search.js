$(document).ready(function() {
    $('.search').on('keydown', function(event) {
        if (event.which === 13) {
        event.preventDefault();
        }
    });
});

$(document).ready(function() {
    $('#search').on('input', function() {
        var searchText = $(this).val().toLowerCase();
        $('.flex.post-container').each(function() {
        var title = $(this).find('.post-title').text().toLowerCase().replace(/[^\w\s]/g, '');;
        var description = $(this).find('.post-description').text().toLowerCase().replace(/[^\w\s]/g, '');;
        if (title.includes(searchText) || description.includes(searchText)) {
            $(this).show();
        } else {
            $(this).hide();
        }
        });
    });
});